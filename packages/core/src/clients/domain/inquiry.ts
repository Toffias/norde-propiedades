import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';
import type { Email } from '../../shared/domain/value-objects/email';
import type { Phone } from '../../shared/domain/value-objects/phone';

import type { MissingContactInfoError } from './client';
import type { ContactChannel } from './contact-channel';
import type { InquiryEvent } from './inquiry.events';

export type InquiryId = Id<'Inquiry'>;

/** `pending`: sin asignar; `assigned`: ya es de un cliente; `deleted`: en "Borradas". */
export const INQUIRY_STATUSES = ['pending', 'assigned', 'deleted'] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export interface InquirySender {
  readonly name: string | undefined;
  /** Normalizado (minúsculas). */
  readonly email: string | undefined;
  readonly phoneE164: string | undefined;
  /** `Phone.matchKey`: con esta clave se buscan los clientes que coinciden. */
  readonly phoneMatchKey: string | undefined;
}

export interface InquirySnapshot {
  readonly id: InquiryId;
  readonly channel: ContactChannel;
  /** ID de la consulta en el canal de origen: la misma no entra dos veces. */
  readonly externalId: string;
  readonly receivedAt: Date;
  readonly sender: InquirySender;
  readonly message: string | undefined;
  /** Propiedad y emprendimiento del módulo properties, por ID. */
  readonly propertyId: string | undefined;
  readonly developmentId: string | undefined;
  /** Sucursal (identity) que la atiende: la de la propiedad hasta que se asigna. */
  readonly branchId: string | undefined;
  /** Etiquetas automáticas (`inquiryAutoTags`), como códigos. */
  readonly autoTags: readonly string[];
  readonly status: InquiryStatus;
  readonly clientId: string | undefined;
  readonly opportunityId: string | undefined;
  /** Usuario de identity, por ID. */
  readonly assignedAgentId: string | undefined;
  readonly assignedAt: Date | undefined;
  readonly assignedBy: string | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | undefined;
  readonly deletedBy: string | undefined;
}

export interface InquiryAlreadyDeletedError {
  readonly type: 'InquiryAlreadyDeleted';
}

export interface InquiryNotDeletedError {
  readonly type: 'InquiryNotDeleted';
}

/**
 * Una consulta entrante de un portal o de la web. Entra pendiente y termina asignada a un cliente
 * (existente o nuevo) o en "Borradas".
 */
export class Inquiry extends AggregateRoot<InquiryId, InquiryEvent> {
  #state: InquirySnapshot;

  private constructor(state: InquirySnapshot) {
    super(state.id);
    this.#state = state;
  }

  /**
   * Sin teléfono ni email no hay a quién responderle ni con qué deduplicar. Una fecha de recepción
   * futura (un reloj adelantado en el portal) se toma como `now`.
   */
  static receive(input: {
    readonly id: InquiryId;
    readonly channel: ContactChannel;
    readonly externalId: string;
    readonly receivedAt: Date | undefined;
    readonly name: string | undefined;
    readonly phone: Phone | undefined;
    readonly email: Email | undefined;
    readonly message: string | undefined;
    readonly propertyId: string | undefined;
    readonly developmentId: string | undefined;
    readonly branchId: string | undefined;
    readonly autoTags: readonly string[];
    readonly now: Date;
  }): Result<Inquiry, MissingContactInfoError> {
    if (!input.phone && !input.email) return err({ type: 'MissingContactInfo' });

    const received = input.receivedAt;
    const inquiry = new Inquiry({
      id: input.id,
      channel: input.channel,
      externalId: input.externalId,
      receivedAt:
        received === undefined || received.getTime() > input.now.getTime() ? input.now : received,
      sender: {
        name: input.name,
        email: input.email?.value,
        phoneE164: input.phone?.e164,
        phoneMatchKey: input.phone?.matchKey,
      },
      message: input.message,
      propertyId: input.propertyId?.toLowerCase(),
      developmentId: input.developmentId?.toLowerCase(),
      branchId: input.branchId,
      autoTags: [...input.autoTags],
      status: 'pending',
      clientId: undefined,
      opportunityId: undefined,
      assignedAgentId: undefined,
      assignedAt: undefined,
      assignedBy: undefined,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: undefined,
      deletedBy: undefined,
    });
    inquiry.record({
      type: 'clients.inquiry_received',
      aggregateId: inquiry.id,
      occurredAt: input.now,
      payload: {
        inquiryId: inquiry.id,
        channel: inquiry.#state.channel,
        propertyId: inquiry.#state.propertyId,
        developmentId: inquiry.#state.developmentId,
      },
    });
    return ok(inquiry);
  }

  static restore(snapshot: InquirySnapshot): Inquiry {
    return new Inquiry(snapshot);
  }

  get status(): InquiryStatus {
    return this.#state.status;
  }

  get clientId(): string | undefined {
    return this.#state.clientId;
  }

  get isDeleted(): boolean {
    return this.#state.status === 'deleted';
  }

  /** La manda a "Borradas": no se borra, se restaura desde ahí. */
  delete(by: string, now: Date): Result<void, InquiryAlreadyDeletedError> {
    if (this.isDeleted) return err({ type: 'InquiryAlreadyDeleted' });
    this.#state = {
      ...this.#state,
      status: 'deleted',
      deletedAt: now,
      deletedBy: by,
      updatedAt: now,
    };
    this.record({
      type: 'clients.inquiry_deleted',
      aggregateId: this.id,
      occurredAt: now,
      payload: { inquiryId: this.id },
    });
    return ok(undefined);
  }

  /** Vuelve a donde estaba: asignada si ya tenía cliente, pendiente si no. */
  restoreFromTrash(now: Date): Result<void, InquiryNotDeletedError> {
    if (!this.isDeleted) return err({ type: 'InquiryNotDeleted' });
    this.#state = {
      ...this.#state,
      status: this.#state.clientId === undefined ? 'pending' : 'assigned',
      deletedAt: undefined,
      deletedBy: undefined,
      updatedAt: now,
    };
    this.record({
      type: 'clients.inquiry_restored',
      aggregateId: this.id,
      occurredAt: now,
      payload: { inquiryId: this.id },
    });
    return ok(undefined);
  }

  toSnapshot(): InquirySnapshot {
    return { ...this.#state, autoTags: [...this.#state.autoTags] };
  }
}
