import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import type { Result } from '../../shared/domain/result';

import type { ClientId } from './client';
import type { ContactChannel } from './contact-channel';
import type { OpportunityEvent } from './opportunity.events';
import {
  checkTransition,
  isOpenStatus,
  type InvalidStatusTransitionError,
  type OpportunityStatus,
} from './opportunity-status';

export type OpportunityId = Id<'Opportunity'>;

/** Catalogación del diagrama: qué busca el cliente. */
export const OPPORTUNITY_TYPES = ['sale', 'rent', 'appraisal'] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

/** Qué pidió en concreto. Ordenadas de menor a mayor compromiso. */
export const OPPORTUNITY_INTENTS = ['info', 'contact', 'visit'] as const;
export type OpportunityIntent = (typeof OPPORTUNITY_INTENTS)[number];

/** Búsqueda del cliente, guardada para seguimiento y para cruzarla con el stock. */
export interface OpportunitySearch {
  readonly operation?: string | undefined;
  readonly propertyType?: string | undefined;
  readonly location?: string | undefined;
  readonly currency?: string | undefined;
  readonly minPriceCents?: bigint | undefined;
  readonly maxPriceCents?: bigint | undefined;
  readonly minRooms?: number | undefined;
  readonly maxRooms?: number | undefined;
  readonly minBedrooms?: number | undefined;
  readonly amenities?: readonly string[] | undefined;
}

export interface OpportunityNote {
  readonly text: string;
  readonly createdAt: Date;
}

export interface OpportunitySnapshot {
  readonly id: OpportunityId;
  readonly clientId: ClientId;
  readonly originChannel: ContactChannel;
  readonly type: OpportunityType;
  readonly intent: OpportunityIntent;
  readonly status: OpportunityStatus;
  readonly propertyId: string | undefined;
  readonly search: OpportunitySearch | undefined;
  readonly notes: readonly OpportunityNote[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const MAX_NOTE_LENGTH = 2000;

function note(text: string | undefined, now: Date): OpportunityNote[] {
  const trimmed = text?.trim().slice(0, MAX_NOTE_LENGTH);
  return trimmed ? [{ text: trimmed, createdAt: now }] : [];
}

function strongestIntent(a: OpportunityIntent, b: OpportunityIntent): OpportunityIntent {
  return OPPORTUNITY_INTENTS.indexOf(a) >= OPPORTUNITY_INTENTS.indexOf(b) ? a : b;
}

/** Cada consulta o interés concreto de un cliente. Un cliente puede tener varias. */
export class Opportunity extends AggregateRoot<OpportunityId, OpportunityEvent> {
  #state: Omit<OpportunitySnapshot, 'id'>;

  private constructor(id: OpportunityId, state: Omit<OpportunitySnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static open(input: {
    readonly id: OpportunityId;
    readonly clientId: ClientId;
    readonly originChannel: ContactChannel;
    readonly type: OpportunityType;
    readonly intent: OpportunityIntent;
    /** Si Norde no tiene stock para ofrecerle, nace en "Aplica a otra inmobiliaria". */
    readonly noMatchingStock: boolean;
    readonly propertyId?: string | undefined;
    readonly search?: OpportunitySearch | undefined;
    readonly note?: string | undefined;
    readonly now: Date;
  }): Opportunity {
    const opportunity = new Opportunity(input.id, {
      clientId: input.clientId,
      originChannel: input.originChannel,
      type: input.type,
      intent: input.intent,
      status: input.noMatchingStock ? 'referred_to_partner' : 'new',
      propertyId: input.propertyId,
      search: input.search,
      notes: note(input.note, input.now),
      createdAt: input.now,
      updatedAt: input.now,
    });
    opportunity.record({
      type: 'clients.opportunity_created',
      aggregateId: input.id,
      occurredAt: input.now,
      payload: { opportunityId: input.id, clientId: input.clientId },
    });
    return opportunity;
  }

  static restore(snapshot: OpportunitySnapshot): Opportunity {
    const { id, ...state } = snapshot;
    return new Opportunity(id, state);
  }

  get clientId(): ClientId {
    return this.#state.clientId;
  }

  get type(): OpportunityType {
    return this.#state.type;
  }

  get intent(): OpportunityIntent {
    return this.#state.intent;
  }

  get status(): OpportunityStatus {
    return this.#state.status;
  }

  get propertyId(): string | undefined {
    return this.#state.propertyId;
  }

  get notes(): readonly OpportunityNote[] {
    return this.#state.notes;
  }

  isOpen(): boolean {
    return isOpenStatus(this.#state.status);
  }

  /** Misma consulta: mismo tipo y misma propiedad (o ninguna). */
  isAbout(query: { readonly type: OpportunityType; readonly propertyId?: string | undefined }) {
    return this.#state.type === query.type && this.#state.propertyId === query.propertyId;
  }

  /**
   * El cliente volvió a consultar por lo mismo: se suma a esta oportunidad en lugar de abrir
   * otra. La intención solo sube (quien pidió visitar no vuelve a "solo info").
   */
  addRequest(input: {
    readonly intent: OpportunityIntent;
    readonly note?: string | undefined;
    readonly search?: OpportunitySearch | undefined;
    readonly now: Date;
  }): void {
    this.#state = {
      ...this.#state,
      intent: strongestIntent(this.#state.intent, input.intent),
      search: input.search ?? this.#state.search,
      notes: [...this.#state.notes, ...note(input.note, input.now)],
      updatedAt: input.now,
    };
    this.record({
      type: 'clients.opportunity_request_added',
      aggregateId: this.id,
      occurredAt: input.now,
      payload: { opportunityId: this.id, clientId: this.#state.clientId },
    });
  }

  changeStatus(to: OpportunityStatus, now: Date): Result<void, InvalidStatusTransitionError> {
    const from = this.#state.status;
    const check = checkTransition(from, to);
    if (check.isErr()) return check;

    this.#state = { ...this.#state, status: to, updatedAt: now };
    this.record({
      type: 'clients.opportunity_status_changed',
      aggregateId: this.id,
      occurredAt: now,
      payload: { opportunityId: this.id, clientId: this.#state.clientId, from, to },
    });
    return check;
  }

  toSnapshot(): OpportunitySnapshot {
    return { id: this.id, ...this.#state };
  }
}

/** La oportunidad abierta que corresponde a una nueva consulta del cliente, si existe. */
export function findOpenOpportunityAbout(
  opportunities: readonly Opportunity[],
  query: { readonly type: OpportunityType; readonly propertyId?: string | undefined },
): Opportunity | undefined {
  return opportunities.find((o) => o.isOpen() && o.isAbout(query));
}
