import {
  auditCreated,
  Email,
  err,
  nextId,
  ok,
  Phone,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type InvalidEmailError,
  type InvalidPhoneError,
  type Result,
} from '../../../shared';
import {
  ReceiveInquiryInputSchema,
  type ReceiveInquiryInput,
  type ReceiveInquiryOutput,
} from '../../contracts';
import type { MissingContactInfoError } from '../../domain/client';
import { Inquiry } from '../../domain/inquiry';
import { inquiryAutoTags } from '../../domain/inquiry-tags';
import { invalidInput, type InvalidInputError } from '../client-support';
import { inquiryAuditState, inquiryTarget } from '../inquiry-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import type { InquiryPropertyLookup } from '../ports/inquiry-property-lookup';

export type ReceiveInquiryError =
  | ForbiddenError
  | InvalidInputError
  | InvalidPhoneError
  | InvalidEmailError
  | MissingContactInfoError;

/**
 * Registra una consulta entrante de un portal o de la web, pendiente en la bandeja. Es idempotente:
 * si ya entró una con el mismo canal e ID externo (un reintento del portal, un doble envío del
 * formulario), devuelve esa y no escribe nada. Toma las etiquetas automáticas y la sucursal de la
 * propiedad consultada.
 *
 * Solo la ejecutan los procesos que reciben consultas (web, portales, agente de IA).
 */
export class ReceiveInquiry {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly properties: InquiryPropertyLookup;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ReceiveInquiryInput,
    actor: Actor,
  ): Promise<Result<ReceiveInquiryOutput, ReceiveInquiryError>> {
    if (actor.kind !== 'system' || !actor.can('inquiries:receive')) {
      return err({ type: 'Forbidden' });
    }

    const parsed = ReceiveInquiryInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
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

    const property =
      data.propertyId === undefined ? undefined : await this.deps.properties.facts(data.propertyId);
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<ReceiveInquiryOutput, ReceiveInquiryError>> => {
        const existing = await tx.inquiries.findByExternal(data.channel, data.externalId);
        if (existing) return ok({ inquiryId: existing.id, duplicate: true });

        const received = Inquiry.receive({
          id: nextId<'Inquiry'>(this.deps.ids),
          channel: data.channel,
          externalId: data.externalId,
          receivedAt: data.receivedAt,
          name: data.name,
          phone,
          email,
          message: data.message,
          propertyId: data.propertyId,
          // Una consulta por una unidad es también una consulta por su emprendimiento.
          developmentId: data.developmentId ?? property?.developmentId,
          branchId: property?.branchId,
          autoTags: inquiryAutoTags(data.channel, property),
          now,
        });
        if (received.isErr()) return err(received.error);
        const inquiry = received.value;

        if (!(await tx.inquiries.insert(inquiry, actor.id))) {
          // Otra entrega del mismo envío entró mientras tanto: se devuelve esa.
          const winner = await tx.inquiries.findByExternal(data.channel, data.externalId);
          if (!winner) throw new Error('Inquiry insert conflicted but no inquiry was found');
          return ok({ inquiryId: winner.id, duplicate: true });
        }
        await tx.events.publish(inquiry.pullEvents());
        await tx.audit.record(
          auditCreated(
            actor,
            inquiryTarget('inquiry.received', inquiry),
            inquiryAuditState(inquiry),
          ),
        );
        return ok({ inquiryId: inquiry.id, duplicate: false });
      },
    );
  }
}
