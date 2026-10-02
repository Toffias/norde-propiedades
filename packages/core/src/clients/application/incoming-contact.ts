import {
  auditAction,
  auditCreated,
  diffChanges,
  err,
  nextId,
  ok,
  type Actor,
  type Email,
  type IdGenerator,
  type Phone,
  type Result,
} from '../../shared';
import { Client, type MissingContactInfoError } from '../domain/client';
import type { ContactChannel } from '../domain/contact-channel';
import {
  findOpenOpportunityAbout,
  Opportunity,
  type OpportunityIntent,
  type OpportunitySearch,
  type OpportunityType,
} from '../domain/opportunity';
import { initialStage } from '../domain/opportunity-settings';
import { firstActiveStageOf } from '../domain/opportunity-stage';

import { clientAuditState, clientTarget } from './client-support';
import { opportunityAuditState } from './opportunity-support';
import type { ClientsTransaction } from './ports/clients-transaction';

// Lo que comparten los contactos entrantes: los que registra el agente de IA (`RegisterContact`)
// y las consultas que se asignan desde la bandeja (`AssignInquiry`).

export interface IncomingContact {
  /** El cliente que ya existe, si se encontró o se eligió; sin él, se registra uno nuevo. */
  readonly existing: Client | undefined;
  readonly contact: {
    readonly name: string | undefined;
    readonly phone: Phone | undefined;
    readonly email: Email | undefined;
  };
  readonly channel: ContactChannel;
  readonly channelExternalId: string;
  readonly opportunity: {
    readonly type: OpportunityType;
    readonly intent: OpportunityIntent;
    readonly propertyId?: string | undefined;
    readonly search?: OpportunitySearch | undefined;
    readonly note?: string | undefined;
    readonly noMatchingStock: boolean;
  };
}

export interface RecordedContact {
  readonly client: Client;
  readonly opportunity: Opportunity;
  readonly clientCreated: boolean;
  readonly opportunityCreated: boolean;
}

/**
 * Registra el contacto: agrega el canal al cliente (lo restaura si estaba en la papelera, porque
 * volvió a contactarse) o registra uno nuevo, y abre una oportunidad o suma el pedido a la abierta
 * por lo mismo. Guarda, publica los eventos y audita.
 */
export async function recordIncomingContact(
  tx: ClientsTransaction,
  actor: Actor,
  deps: { readonly ids: IdGenerator; readonly now: Date },
  input: IncomingContact,
): Promise<Result<RecordedContact, MissingContactInfoError>> {
  const { existing, contact } = input;
  const { now } = deps;

  const clientBefore = existing ? clientAuditState(existing) : undefined;
  let restored = false;
  let client: Client;
  if (existing) {
    client = existing;
    // Estaba en la papelera y volvió a escribir: vuelve a la agenda.
    restored = client.restoreFromTrash(now).isOk();
    client.recordContact(input.channel, input.channelExternalId, now);
    client.completeProfile(contact);
  } else {
    const registered = Client.register({
      id: nextId<'Client'>(deps.ids),
      ...contact,
      channel: input.channel,
      channelExternalId: input.channelExternalId,
      now,
    });
    if (registered.isErr()) return err(registered.error);
    client = registered.value;
  }

  const { type, intent, propertyId, search, note, noMatchingStock } = input.opportunity;
  const open = findOpenOpportunityAbout(await tx.opportunities.findOpenByClient(client.id), {
    type,
    propertyId,
  });

  const stages = await tx.stages.findAll();
  const opportunityBefore = open ? opportunityAuditState(open) : undefined;
  let opportunity: Opportunity;
  if (open) {
    opportunity = open;
    opportunity.addRequest({ intent, note, search, now });
    // Si antes tenía stock para ofrecerle y ahora no, pasa a "Aplica a otra inmobiliaria".
    const referred = firstActiveStageOf(stages, 'referred_to_partner');
    if (noMatchingStock && opportunity.status === 'new' && referred) {
      const moved = opportunity.moveToStage(referred.ref(), {
        id: nextId<'OpportunityStatusChange'>(deps.ids),
        now,
      });
      if (moved.isErr()) throw new Error(`Unexpected referral failure: ${moved.error.type}`);
    }
  } else {
    const stage = initialStage(stages, await tx.opportunitySettings.get(), noMatchingStock);
    // Cada categoría conserva un estado activo (regla de OpportunityStage).
    if (!stage) throw new Error('No active opportunity stage for a new opportunity');
    const { ownerId, ownerBranchId } = client.ownership;
    opportunity = Opportunity.open({
      id: nextId<'Opportunity'>(deps.ids),
      clientId: client.id,
      originChannel: input.channel,
      type,
      intent,
      stage: stage.ref(),
      agent: { agentId: ownerId, branchId: ownerBranchId },
      statusChangeId: nextId<'OpportunityStatusChange'>(deps.ids),
      propertyId,
      search,
      note,
      now,
    });
  }

  await tx.clients.save(client, actor.id);
  await tx.opportunities.save(opportunity, actor.id);
  await tx.events.publish([...client.pullEvents(), ...opportunity.pullEvents()]);
  if (restored)
    await tx.audit.record(auditAction(actor, clientTarget('client.restored', client.id)));
  await tx.audit.record(
    clientBefore
      ? auditAction(
          actor,
          clientTarget('client.contact_recorded', client.id),
          diffChanges(clientBefore, clientAuditState(client)),
        )
      : auditCreated(actor, clientTarget('client.registered', client.id), clientAuditState(client)),
  );
  const opportunityTarget = {
    entityType: 'opportunity',
    entityId: opportunity.id,
    clientIds: [client.id],
  };
  await tx.audit.record(
    opportunityBefore
      ? auditAction(
          actor,
          { ...opportunityTarget, action: 'opportunity.request_added' },
          diffChanges(opportunityBefore, opportunityAuditState(opportunity)),
        )
      : auditCreated(
          actor,
          { ...opportunityTarget, action: 'opportunity.opened' },
          opportunityAuditState(opportunity),
        ),
  );

  return ok({ client, opportunity, clientCreated: !existing, opportunityCreated: !open });
}
