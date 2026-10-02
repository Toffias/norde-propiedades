import {
  auditAction,
  diffChanges,
  Email,
  Phone,
  type Actor,
  type AuditChanges,
  type IdGenerator,
} from '../../shared';
import type { AssignInquiryOutput } from '../contracts';
import type { Client } from '../domain/client';
import type { ContactKeys } from '../domain/duplicate-check';
import type { Inquiry } from '../domain/inquiry';
import type { OpportunityType } from '../domain/opportunity';

import { clientAuditState, clientTarget } from './client-support';
import { recordIncomingContact } from './incoming-contact';
import { inquiryTarget } from './inquiry-support';
import { reassignOpportunityTo } from './opportunity-support';
import type { ClientsTransaction } from './ports/clients-transaction';

// Lo que comparten la asignación desde la bandeja (`AssignInquiry`) y el reparto automático
// (`RouteInquiry`).

/** El agente a cargo y su sucursal; sin agente, nadie. */
export interface AgentRef {
  readonly agentId: string | undefined;
  readonly branchId: string | undefined;
}

/** El remitente con los value objects del dominio: se normalizaron al entrar. */
export function senderContact(inquiry: Inquiry): {
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

/** Con qué se buscan los clientes que coinciden con el remitente. */
export function senderKeys(inquiry: Inquiry): ContactKeys {
  const { phone, email } = senderContact(inquiry);
  return { phones: phone ? [phone] : [], emails: email ? [email] : [] };
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

/** Un cliente sin agente queda a cargo del de la oportunidad. */
async function takeCharge(
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

/**
 * Asigna una consulta pendiente (ya bloqueada) a un cliente: registra el contacto con la misma regla
 * que `RegisterContact` (agrega el canal o crea el cliente, y abre una oportunidad por la propiedad
 * consultada o suma el pedido a la abierta por lo mismo), deja la oportunidad a cargo del agente que
 * elige `chooseAgent` (si es otro, la reasigna y corre "al asignar") y un cliente sin agente, a su
 * cargo también. Guarda, publica y audita.
 */
export async function assignInquiryIn(
  tx: ClientsTransaction,
  actor: Actor,
  deps: { readonly ids: IdGenerator; readonly now: Date },
  input: {
    readonly inquiry: Inquiry;
    /** Sin cliente, se crea uno con los datos de la consulta. */
    readonly existing: Client | undefined;
    readonly type: OpportunityType;
    /** Con el agente que ya tiene la oportunidad (el del cliente, o nadie). */
    readonly chooseAgent: (current: AgentRef) => Promise<AgentRef>;
    /** Lo que se suma a la auditoría de la asignación (la regla que la repartió). */
    readonly auditExtra?: AuditChanges;
  },
): Promise<AssignInquiryOutput> {
  const { inquiry, existing } = input;
  const { now } = deps;
  const recorded = await recordIncomingContact(tx, actor, deps, {
    existing,
    contact: senderContact(inquiry),
    channel: inquiry.channel,
    channelExternalId: inquiry.senderChannelId,
    opportunity: {
      type: input.type,
      intent: 'contact',
      propertyId: inquiry.propertyId,
      note: inquiry.opportunityNote,
      noMatchingStock: false,
    },
  });
  // `receive` exige un teléfono o un email: el registro no puede quedar sin datos de contacto.
  if (recorded.isErr()) throw new Error(`Inquiry ${inquiry.id} has no contact info`);
  const { client, opportunity, clientCreated, opportunityCreated } = recorded.value;

  const current = opportunity.toSnapshot();
  const agent = await input.chooseAgent({ agentId: current.agentId, branchId: current.branchId });
  if (client.ownership.ownerId === undefined && agent.agentId !== undefined) {
    await takeCharge(tx, client, agent, actor, now);
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
  // Quien llama la bloqueó y comprobó que estaba pendiente.
  if (assigned.isErr()) throw new Error(`Inquiry ${inquiry.id} is not pending`);
  await tx.inquiries.save(inquiry, actor.id);
  await tx.events.publish(inquiry.pullEvents());
  await tx.audit.record(
    auditAction(actor, inquiryTarget('inquiry.assigned', inquiry), {
      ...diffChanges(before, assignmentState(inquiry)),
      ...input.auditExtra,
    }),
  );

  return { clientId: client.id, opportunityId: opportunity.id, clientCreated, opportunityCreated };
}
