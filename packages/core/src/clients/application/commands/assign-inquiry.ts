import {
  auditAction,
  diffChanges,
  Email,
  err,
  ok,
  Phone,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import {
  AssignInquiryInputSchema,
  type AssignInquiryInput,
  type AssignInquiryOutput,
} from '../../contracts';
import type { Client } from '../../domain/client';
import { findExistingClient } from '../../domain/duplicate-check';
import type {
  Inquiry,
  InquiryAlreadyAssignedError,
  InquiryInTrashError,
} from '../../domain/inquiry';
import {
  clientAuditState,
  clientTarget,
  invalidInput,
  resolveAgent,
  type AgentNotFoundError,
  type DuplicateClientError,
  type InvalidInputError,
} from '../client-support';
import { recordIncomingContact } from '../incoming-contact';
import {
  canManageInquiries,
  findInquiryForUpdate,
  inquiryTarget,
  type InquiryNotFoundError,
} from '../inquiry-support';
import { reassignOpportunityTo } from '../opportunity-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientsTransaction, ClientsUnitOfWork } from '../ports/clients-transaction';

/** El cliente elegido no comparte el teléfono ni el email de la consulta. */
export interface InquiryClientMismatchError {
  readonly type: 'InquiryClientMismatch';
}

export type AssignInquiryError =
  | ForbiddenError
  | InvalidInputError
  | InquiryNotFoundError
  | InquiryAlreadyAssignedError
  | InquiryInTrashError
  | InquiryClientMismatchError
  | DuplicateClientError
  | AgentNotFoundError;

/** El agente a cargo y su sucursal; sin agente, nadie. */
interface AgentRef {
  readonly agentId: string | undefined;
  readonly branchId: string | undefined;
}

/** Lo que se audita de la asignación: a quién quedó, sin los datos del remitente. */
function assignmentState(inquiry: Inquiry) {
  const s = inquiry.toSnapshot();
  return {
    status: s.status,
    clientId: s.clientId,
    opportunityId: s.opportunityId,
    assignedAgentId: s.assignedAgentId,
    branchId: s.branchId,
  };
}

/**
 * "Asignar a este cliente" o "Crear cliente nuevo" desde la bandeja (`inquiries:manage`). Registra
 * el contacto con la misma regla que `RegisterContact`: agrega el canal al cliente (o lo crea) y
 * abre una oportunidad por la propiedad consultada, o suma el pedido a la abierta por lo mismo.
 *
 * El agente elegido queda a cargo de la oportunidad; si es otro que el que tenía, se reasigna y
 * corre la regla "al asignar". Un cliente nuevo, o uno sin agente, queda también a su cargo.
 */
export class AssignInquiry {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly agents: ClientAgents;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: AssignInquiryInput,
    actor: Actor,
  ): Promise<Result<AssignInquiryOutput, AssignInquiryError>> {
    if (!canManageInquiries(actor)) return err({ type: 'Forbidden' });

    const parsed = AssignInquiryInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const data = parsed.data;

    let chosen: AgentRef | undefined;
    if (data.agentId !== undefined) {
      const resolved = await resolveAgent(this.deps.agents, data.agentId);
      if (resolved.isErr()) return err(resolved.error);
      chosen = resolved.value;
    }
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<AssignInquiryOutput, AssignInquiryError>> => {
        const inquiry = await findInquiryForUpdate(tx.inquiries, data.inquiryId);
        if (!inquiry) return err({ type: 'InquiryNotFound' });
        if (inquiry.isDeleted) return err({ type: 'InquiryInTrash' });
        if (inquiry.status === 'assigned') return err({ type: 'InquiryAlreadyAssigned' });

        const contact = senderContact(inquiry);
        const keys = {
          phones: contact.phone ? [contact.phone] : [],
          emails: contact.email ? [contact.email] : [],
        };
        const matches = await tx.clients.findMatching(keys);
        let existing: Client | undefined;
        if (data.target.kind === 'client') {
          const { clientId } = data.target;
          existing = matches.find((c) => c.id === clientId);
          if (!existing) return err({ type: 'InquiryClientMismatch' });
        } else {
          const duplicate = findExistingClient(matches, keys);
          if (duplicate) {
            return err({
              type: 'DuplicateClient',
              clientId: duplicate.id,
              trashed: duplicate.isDeleted,
            });
          }
        }

        const recorded = await recordIncomingContact(
          tx,
          actor,
          { ids: this.deps.ids, now },
          {
            existing,
            contact,
            channel: inquiry.channel,
            channelExternalId: inquiry.senderChannelId,
            opportunity: {
              type: data.type ?? inquiry.suggestedOpportunityType,
              intent: 'contact',
              propertyId: inquiry.propertyId,
              note: inquiry.opportunityNote,
              noMatchingStock: false,
            },
          },
        );
        // `receive` exige un teléfono o un email: el registro no puede quedar sin datos de contacto.
        if (recorded.isErr()) throw new Error(`Inquiry ${inquiry.id} has no contact info`);
        const { client, opportunity, clientCreated, opportunityCreated } = recorded.value;

        // Sin elegir: el que ya tiene la oportunidad o, si nadie la tiene, quien asigna.
        const current = opportunity.toSnapshot();
        const agent =
          chosen ??
          (current.agentId === undefined && actor.kind === 'user'
            ? await this.actorAsAgent(actor)
            : { agentId: current.agentId, branchId: current.branchId });

        if (client.ownership.ownerId === undefined && agent.agentId !== undefined) {
          await this.takeCharge(tx, client, agent, actor, now);
        }
        const reassigned = await reassignOpportunityTo(tx, opportunity, agent, actor, now);
        // Recién abierta o actualizada por una consulta: está abierta.
        if (reassigned.isErr()) throw new Error(`Opportunity ${opportunity.id} is closed`);

        const before = assignmentState(inquiry);
        const assigned = inquiry.assign({
          clientId: client.id,
          opportunityId: opportunity.id,
          agent,
          by: actor.id,
          now,
        });
        if (assigned.isErr()) return err(assigned.error);
        await tx.inquiries.save(inquiry, actor.id);
        await tx.events.publish(inquiry.pullEvents());
        await tx.audit.record(
          auditAction(
            actor,
            inquiryTarget('inquiry.assigned', inquiry),
            diffChanges(before, assignmentState(inquiry)),
          ),
        );

        return ok({
          clientId: client.id,
          opportunityId: opportunity.id,
          clientCreated,
          opportunityCreated,
        });
      },
    );
  }

  /** Quien asigna, si es un agente activo; si no, la oportunidad sigue sin nadie a cargo. */
  private async actorAsAgent(actor: Actor): Promise<AgentRef> {
    const resolved = await resolveAgent(this.deps.agents, actor.id);
    return resolved.isOk() ? resolved.value : { agentId: undefined, branchId: undefined };
  }

  /** Un cliente sin agente queda a cargo del de la oportunidad. */
  private async takeCharge(
    tx: ClientsTransaction,
    client: Client,
    agent: AgentRef,
    actor: Actor,
    now: Date,
  ): Promise<void> {
    const before = clientAuditState(client);
    const changed = client.assignAgent(agent, now);
    // `recordIncomingContact` lo restaura si estaba en la papelera.
    if (changed.isErr()) throw new Error(`Client ${client.id} is in the trash`);
    if (!changed.value) return;
    await tx.clients.save(client, actor.id);
    await tx.events.publish(client.pullEvents());
    await tx.audit.record(
      auditAction(
        actor,
        clientTarget('client.reassigned', client.id),
        diffChanges(before, clientAuditState(client)),
      ),
    );
  }
}

/** El remitente con los value objects del dominio: se normalizaron al entrar. */
function senderContact(inquiry: Inquiry): {
  readonly name: string | undefined;
  readonly phone: Phone | undefined;
  readonly email: Email | undefined;
} {
  const { name, phoneE164, email } = inquiry.sender;
  let phone: Phone | undefined;
  if (phoneE164 !== undefined) {
    const created = Phone.create(phoneE164);
    if (created.isErr()) throw new Error(`Inquiry ${inquiry.id} has an invalid phone`);
    phone = created.value;
  }
  let parsedEmail: Email | undefined;
  if (email !== undefined) {
    const created = Email.create(email);
    if (created.isErr()) throw new Error(`Inquiry ${inquiry.id} has an invalid email`);
    parsedEmail = created.value;
  }
  return { name, phone, email: parsedEmail };
}
