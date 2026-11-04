import {
  err,
  ok,
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
import { inquiryContact } from '../../domain/inquiry';
import { invalidInput, type InvalidInputError } from '../client-support';
import { receiveInquiryIn } from '../inquiry-intake';
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

    const contact = inquiryContact({ phone: data.phone, email: data.email, message: data.message });
    if (contact.isErr()) return err(contact.error);
    const { phone, email, message } = contact.value;

    const property =
      data.propertyId === undefined ? undefined : await this.deps.properties.facts(data.propertyId);
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<ReceiveInquiryOutput, ReceiveInquiryError>> => {
        const received = await receiveInquiryIn(
          tx,
          actor,
          { ids: this.deps.ids, now },
          {
            channel: data.channel,
            externalId: data.externalId,
            receivedAt: data.receivedAt,
            name: data.name,
            phone,
            email,
            message,
            propertyId: data.propertyId,
            developmentId: data.developmentId,
            property,
          },
        );
        if (received.isErr()) return err(received.error);
        return ok({ inquiryId: received.value.inquiry.id, duplicate: received.value.duplicate });
      },
    );
  }
}
