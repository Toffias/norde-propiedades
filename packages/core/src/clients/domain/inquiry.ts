import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';
import { Email, type InvalidEmailError } from '../../shared/domain/value-objects/email';
import { Phone, type InvalidPhoneError } from '../../shared/domain/value-objects/phone';

import type { MissingContactInfoError } from './client';
import type { ContactChannel } from './contact-channel';
import type { InquiryEvent } from './inquiry.events';
import type { OpportunityType } from './opportunity';

export type InquiryId = Id<'Inquiry'>;

/** Los datos de contacto de una consulta entrante, ya validados. */
export interface InquiryContact {
  readonly phone: Phone | undefined;
  readonly email: Email | undefined;
  /** El mensaje, con el dato que no se pudo tomar al final para que no se pierda. */
  readonly message: string | undefined;
}

/**
 * Valida el teléfono y el email de una consulta entrante. Si uno no es válido pero el otro sí, la
 * consulta se toma igual: el dato inválido se descarta y queda escrito en el mensaje (un lead de un
 * portal no se pierde por un teléfono mal cargado). Sin ningún dato válido, el error del primero.
 */
export function inquiryContact(raw: {
  readonly phone: string | undefined;
  readonly email: string | undefined;
  readonly message: string | undefined;
}): Result<InquiryContact, InvalidPhoneError | InvalidEmailError> {
  const phone = raw.phone === undefined ? undefined : Phone.create(raw.phone);
  const email = raw.email === undefined ? undefined : Email.create(raw.email);
  const validPhone = phone?.isOk() === true ? phone.value : undefined;
  const validEmail = email?.isOk() === true ? email.value : undefined;
  if (validPhone === undefined && validEmail === undefined) {
    if (phone?.isErr() === true) return err(phone.error);
    if (email?.isErr() === true) return err(email.error);
  }
  const notes = [
    phone?.isErr() === true ? `Teléfono que dejó (no es válido): ${raw.phone ?? ''}` : undefined,
    email?.isErr() === true ? `Email que dejó (no es válido): ${raw.email ?? ''}` : undefined,
  ].filter((note): note is string => note !== undefined);
  const message = [raw.message, ...notes].filter((part) => part !== undefined).join('\n\n');
  return ok({
    phone: validPhone,
    email: validEmail,
    message: message === '' ? undefined : message,
  });
}

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

export interface InquiryAlreadyAssignedError {
  readonly type: 'InquiryAlreadyAssigned';
}

export interface InquiryInTrashError {
  readonly type: 'InquiryInTrash';
}

/** Largo máximo de la nota de una oportunidad: lo que exceda del mensaje no entra en ella. */
const MAX_OPPORTUNITY_NOTE_LENGTH = 2000;

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

  get channel(): ContactChannel {
    return this.#state.channel;
  }

  get sender(): InquirySender {
    return this.#state.sender;
  }

  get propertyId(): string | undefined {
    return this.#state.propertyId;
  }

  get branchId(): string | undefined {
    return this.#state.branchId;
  }

  /**
   * Con qué identidad queda el canal en el cliente: el email o, si no tiene, el teléfono. Así las
   * consultas de la misma persona por el mismo portal suman una sola entrada.
   */
  get senderChannelId(): string {
    const { email, phoneE164 } = this.#state.sender;
    const id = email ?? phoneE164;
    // `receive` exige uno de los dos.
    if (id === undefined) throw new Error(`Inquiry ${this.id} has no contact info`);
    return id;
  }

  /** El mensaje como nota de la oportunidad, cortado al largo que admite. */
  get opportunityNote(): string | undefined {
    return this.#state.message?.slice(0, MAX_OPPORTUNITY_NOTE_LENGTH);
  }

  /**
   * Qué busca, por las operaciones de la propiedad consultada: alquiler si solo se alquila
   * (también temporario); si no, venta. Sin propiedad, venta. Quien asigna puede cambiarlo.
   */
  get suggestedOpportunityType(): OpportunityType {
    return suggestedOpportunityType(this.#state.autoTags);
  }

  /**
   * Queda asignada a un cliente y a la oportunidad que se abrió o actualizó por ella. Pasa a la
   * sucursal del agente a cargo (si no tiene, conserva la de la propiedad). Solo una pendiente.
   */
  assign(input: {
    readonly clientId: string;
    readonly opportunityId: string;
    readonly agent: { readonly agentId: string | undefined; readonly branchId: string | undefined };
    readonly by: string;
    readonly now: Date;
  }): Result<void, InquiryAlreadyAssignedError | InquiryInTrashError> {
    if (this.isDeleted) return err({ type: 'InquiryInTrash' });
    if (this.#state.status === 'assigned') return err({ type: 'InquiryAlreadyAssigned' });
    const { agentId, branchId } = input.agent;
    this.#state = {
      ...this.#state,
      status: 'assigned',
      clientId: input.clientId,
      opportunityId: input.opportunityId,
      assignedAgentId: agentId,
      branchId: branchId ?? this.#state.branchId,
      assignedAt: input.now,
      assignedBy: input.by,
      updatedAt: input.now,
    };
    this.record({
      type: 'clients.inquiry_assigned',
      aggregateId: this.id,
      occurredAt: input.now,
      payload: {
        inquiryId: this.id,
        clientId: input.clientId,
        opportunityId: input.opportunityId,
        agentId,
        assignedBy: input.by,
      },
    });
    return ok(undefined);
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

const RENT_OPERATIONS: readonly string[] = ['operation:rent', 'operation:temporary_rent'];

/** Ver `Inquiry.suggestedOpportunityType`: se calcula con las etiquetas, también en la bandeja. */
export function suggestedOpportunityType(autoTags: readonly string[]): OpportunityType {
  const operations = autoTags.filter((tag) => tag.startsWith('operation:'));
  const onlyRent =
    operations.length > 0 && operations.every((tag) => RENT_OPERATIONS.includes(tag));
  return onlyRent ? 'rent' : 'sale';
}
