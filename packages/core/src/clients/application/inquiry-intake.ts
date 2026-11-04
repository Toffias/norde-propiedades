import {
  auditCreated,
  err,
  nextId,
  ok,
  type Actor,
  type Email,
  type IdGenerator,
  type Phone,
  type Result,
} from '../../shared';
import type { MissingContactInfoError } from '../domain/client';
import type { ContactChannel } from '../domain/contact-channel';
import { Inquiry } from '../domain/inquiry';
import { inquiryAutoTags, type InquiryPropertyFacts } from '../domain/inquiry-tags';

import { inquiryAuditState, inquiryTarget } from './inquiry-support';
import type { ClientsTransaction } from './ports/clients-transaction';

// Lo que comparten las consultas que entran de un portal o de la web (`ReceiveInquiry`) y las que
// deja el agente de IA al registrar un contacto (`RegisterContact`).

export interface IncomingInquiry {
  readonly channel: ContactChannel;
  readonly externalId: string;
  readonly receivedAt: Date | undefined;
  readonly name: string | undefined;
  readonly phone: Phone | undefined;
  readonly email: Email | undefined;
  readonly message: string | undefined;
  readonly propertyId: string | undefined;
  readonly developmentId: string | undefined;
  /** La propiedad consultada, para la sucursal y las etiquetas automáticas. */
  readonly property: InquiryPropertyFacts | undefined;
  /** La oportunidad que ya se abrió por ella (agente de IA). */
  readonly opportunityId?: string;
}

/**
 * Deja la consulta pendiente en la bandeja: si ya entró una con el mismo canal e ID externo,
 * devuelve esa y no escribe nada. Publica `clients.inquiry_received` y audita el alta.
 */
export async function receiveInquiryIn(
  tx: ClientsTransaction,
  actor: Actor,
  deps: { readonly ids: IdGenerator; readonly now: Date },
  input: IncomingInquiry,
): Promise<Result<{ inquiry: Inquiry; duplicate: boolean }, MissingContactInfoError>> {
  const existing = await tx.inquiries.findByExternal(input.channel, input.externalId);
  if (existing) return ok({ inquiry: existing, duplicate: true });

  const { property } = input;
  const received = Inquiry.receive({
    id: nextId<'Inquiry'>(deps.ids),
    channel: input.channel,
    externalId: input.externalId,
    receivedAt: input.receivedAt,
    name: input.name,
    phone: input.phone,
    email: input.email,
    message: input.message,
    propertyId: input.propertyId,
    // Una consulta por una unidad es también una consulta por su emprendimiento.
    developmentId: input.developmentId ?? property?.developmentId,
    branchId: property?.branchId,
    autoTags: inquiryAutoTags(input.channel, property),
    ...(input.opportunityId === undefined ? {} : { opportunityId: input.opportunityId }),
    now: deps.now,
  });
  if (received.isErr()) return err(received.error);
  const inquiry = received.value;

  if (!(await tx.inquiries.insert(inquiry, actor.id))) {
    // Otra entrega del mismo envío entró mientras tanto: se devuelve esa.
    const winner = await tx.inquiries.findByExternal(input.channel, input.externalId);
    if (!winner) throw new Error('Inquiry insert conflicted but no inquiry was found');
    return ok({ inquiry: winner, duplicate: true });
  }
  await tx.events.publish(inquiry.pullEvents());
  await tx.audit.record(
    auditCreated(actor, inquiryTarget('inquiry.received', inquiry), inquiryAuditState(inquiry)),
  );
  return ok({ inquiry, duplicate: false });
}
