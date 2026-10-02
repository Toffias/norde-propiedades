import {
  auditAction,
  auditCreated,
  diffChanges,
  Email,
  err,
  nextId,
  ok,
  Phone,
  toAuditValue,
  type Actor,
  type AuditState,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type InvalidEmailError,
  type InvalidPhoneError,
  type Result,
} from '../../../shared';
import {
  RegisterContactInputSchema,
  type RegisterContactInput,
  type RegisterContactOutput,
} from '../../contracts';
import { Client, type MissingContactInfoError } from '../../domain/client';
import { findExistingClient } from '../../domain/duplicate-check';
import { findOpenOpportunityAbout, Opportunity } from '../../domain/opportunity';
import { clientAuditState, clientTarget } from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

/** Lo que se audita de una oportunidad. Las notas quedan en la actividad del cliente. */
function opportunityAuditState(opportunity: Opportunity): AuditState {
  const { clientId, originChannel, type, intent, status, propertyId, search } =
    opportunity.toSnapshot();
  return {
    clientId,
    originChannel,
    type,
    intent,
    status,
    propertyId,
    search: toAuditValue(search),
  };
}

export type RegisterContactError =
  | ForbiddenError
  | { readonly type: 'InvalidInput'; readonly issues: readonly string[] }
  | InvalidPhoneError
  | InvalidEmailError
  | MissingContactInfoError;

/**
 * Registra un contacto entrante (agente de IA, formulario, portal): deduplica el cliente por
 * teléfono o email (con la misma regla que el alta manual), agrega el canal y abre una
 * oportunidad, o suma el pedido a la oportunidad abierta por lo mismo. Si el cliente estaba en la
 * papelera, lo restaura: volvió a contactarse.
 */
export class RegisterContact {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: RegisterContactInput,
    actor: Actor,
  ): Promise<Result<RegisterContactOutput, RegisterContactError>> {
    if (!actor.can('clients:create')) return err({ type: 'Forbidden' });

    const parsed = RegisterContactInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const data = parsed.data;

    let phone: Phone | undefined;
    if (data.phone !== undefined) {
      const created = Phone.create(data.phone);
      if (created.isErr()) return err(created.error);
      phone = created.value;
    }
    let email: Email | undefined;
    if (data.email !== undefined) {
      const created = Email.create(data.email);
      if (created.isErr()) return err(created.error);
      email = created.value;
    }

    const contact = { name: data.name, phone, email };
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<RegisterContactOutput, RegisterContactError>> => {
        const keys = {
          phones: contact.phone ? [contact.phone] : [],
          emails: contact.email ? [contact.email] : [],
        };
        const existing = findExistingClient(await tx.clients.findMatching(keys), keys);

        const clientBefore = existing ? clientAuditState(existing) : undefined;
        let restored = false;
        let client: Client;
        if (existing) {
          client = existing;
          // Estaba en la papelera y volvió a escribir: vuelve a la agenda.
          restored = client.restoreFromTrash(now).isOk();
          client.recordContact(data.channel, data.channelExternalId, now);
          client.completeProfile(contact);
        } else {
          const registered = Client.register({
            id: nextId<'Client'>(this.deps.ids),
            ...contact,
            channel: data.channel,
            channelExternalId: data.channelExternalId,
            now,
          });
          if (registered.isErr()) return err(registered.error);
          client = registered.value;
        }

        const { type, intent, propertyId, search, note, noMatchingStock } = data.opportunity;
        const open = findOpenOpportunityAbout(await tx.opportunities.findOpenByClient(client.id), {
          type,
          propertyId,
        });

        const opportunityBefore = open ? opportunityAuditState(open) : undefined;
        let opportunity: Opportunity;
        if (open) {
          opportunity = open;
          opportunity.addRequest({ intent, note, search, now });
          // Si antes tenía stock para ofrecerle y ahora no, pasa a "Aplica a otra inmobiliaria".
          if (noMatchingStock && opportunity.status === 'new') {
            opportunity.changeStatus('referred_to_partner', now);
          }
        } else {
          opportunity = Opportunity.open({
            id: nextId<'Opportunity'>(this.deps.ids),
            clientId: client.id,
            originChannel: data.channel,
            type,
            intent,
            noMatchingStock,
            propertyId,
            search,
            note,
            now,
          });
        }

        await tx.clients.save(client, actor.id);
        await tx.opportunities.save(opportunity);
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
            : auditCreated(
                actor,
                clientTarget('client.registered', client.id),
                clientAuditState(client),
              ),
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

        return ok({
          clientId: client.id,
          opportunityId: opportunity.id,
          clientCreated: !existing,
          opportunityCreated: !open,
        });
      },
    );
  }
}
