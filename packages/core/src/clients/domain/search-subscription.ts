import type { DomainEvent } from '../../shared/domain/domain-event';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';
import type { Email } from '../../shared/domain/value-objects/email';

import type { ClientId } from './client';
import type { WebFollowUpFrequency } from './follow-up-frequency';
import {
  MAX_SAVED_SEARCH_NAME_LENGTH,
  normalizeSavedSearchFields,
  type InvalidSavedSearchError,
  type SavedSearchFields,
  type SavedSearchId,
} from './saved-search';

export type SearchSubscriptionId = Id<'SearchSubscription'>;

/** Horas que tiene la persona para confirmar el email: después, se vuelve a suscribir. */
export const SEARCH_SUBSCRIPTION_CONFIRM_HOURS = 72;

/**
 * Pedidos sin confirmar por email en las últimas 24 horas. Pasado el tope no se mandan más
 * emails de confirmación: frena que alguien llene de mails la casilla de otro.
 */
export const MAX_PENDING_SUBSCRIPTIONS_PER_EMAIL = 3;

const HOUR_MS = 60 * 60 * 1000;

/** Los criterios del buscador de la web que se guardan en la búsqueda. */
export type SubscriptionCriteria = Omit<
  SavedSearchFields,
  'name' | 'opportunityId' | 'autoSend' | 'frequency'
>;

export interface SearchSubscriptionSnapshot {
  readonly id: SearchSubscriptionId;
  /** Hash del token del link de confirmación: el token en claro solo viaja en el email. */
  readonly tokenHash: string;
  /**
   * Nombre y email que dejó en la web. Al confirmar pasan al contacto y se borran de acá: los
   * datos personales viven en un solo lugar (Ley 25.326).
   */
  readonly contact: { readonly name: string; readonly email: Email } | undefined;
  readonly criteria: SubscriptionCriteria;
  /**
   * Cómo la tituló el buscador ("Departamentos en venta en Palermo"): va en el email y es el
   * nombre de la búsqueda que ve el asesor.
   */
  readonly summary: string;
  readonly frequency: WebFollowUpFrequency;
  readonly requestedAt: Date;
  readonly expiresAt: Date;
  readonly confirmedAt: Date | undefined;
  /** El contacto y la búsqueda que creó la confirmación. */
  readonly clientId: ClientId | undefined;
  readonly savedSearchId: SavedSearchId | undefined;
}

export interface SearchSubscriptionExpiredError {
  readonly type: 'SearchSubscriptionExpired';
}

/**
 * La persona confirmó su email desde la web y quedó suscripta a una búsqueda: avisa a su asesor
 * en la campana.
 */
export type SearchSubscribed = DomainEvent<
  'clients.search_subscribed',
  {
    readonly subscriptionId: string;
    readonly clientId: string;
    readonly savedSearchId: string;
    readonly agentId: string | undefined;
  }
>;

const MAX_NAME_LENGTH = 120;
const MAX_SUMMARY_LENGTH = 200;

/** Corta en el tope con "…", para el nombre de la búsqueda. Vacío: sin nombre. */
function shorten(value: string, max: number): string | undefined {
  if (value === '') return undefined;
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

function cleanText(value: string, max: number): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, max);
}

/**
 * Una suscripción a una búsqueda pedida desde el buscador de la web (#208), con doble
 * confirmación: se guarda pendiente y se le manda un email con un link. Solo al confirmarlo se
 * crea (o se encuentra) el contacto y se le guarda la búsqueda con envío automático.
 */
export class SearchSubscription {
  #state: SearchSubscriptionSnapshot;
  #events: SearchSubscribed[] = [];

  private constructor(state: SearchSubscriptionSnapshot) {
    this.#state = state;
  }

  static request(input: {
    readonly id: SearchSubscriptionId;
    readonly tokenHash: string;
    readonly name: string;
    readonly email: Email;
    readonly criteria: SubscriptionCriteria;
    readonly summary: string;
    readonly frequency: WebFollowUpFrequency;
    readonly now: Date;
  }): Result<SearchSubscription, InvalidSavedSearchError> {
    const normalized = normalizeSavedSearchFields({
      ...input.criteria,
      name: undefined,
      opportunityId: undefined,
      autoSend: true,
      frequency: input.frequency,
    });
    if (normalized.isErr()) return err(normalized.error);
    const fields = normalized.value;
    const criteria: SubscriptionCriteria = {
      operation: fields.operation,
      propertyTypes: fields.propertyTypes,
      currency: fields.currency,
      minPriceCents: fields.minPriceCents,
      maxPriceCents: fields.maxPriceCents,
      locationIds: fields.locationIds,
      minRooms: fields.minRooms,
    };
    return ok(
      new SearchSubscription({
        id: input.id,
        tokenHash: input.tokenHash,
        contact: {
          name: cleanText(input.name, MAX_NAME_LENGTH),
          email: input.email,
        },
        criteria,
        summary: cleanText(input.summary, MAX_SUMMARY_LENGTH),
        frequency: input.frequency,
        requestedAt: input.now,
        expiresAt: new Date(input.now.getTime() + SEARCH_SUBSCRIPTION_CONFIRM_HOURS * HOUR_MS),
        confirmedAt: undefined,
        clientId: undefined,
        savedSearchId: undefined,
      }),
    );
  }

  static restore(snapshot: SearchSubscriptionSnapshot): SearchSubscription {
    return new SearchSubscription(snapshot);
  }

  get id(): SearchSubscriptionId {
    return this.#state.id;
  }

  get contact(): SearchSubscriptionSnapshot['contact'] {
    return this.#state.contact;
  }

  get criteria(): SubscriptionCriteria {
    return this.#state.criteria;
  }

  get summary(): string {
    return this.#state.summary;
  }

  get frequency(): WebFollowUpFrequency {
    return this.#state.frequency;
  }

  get isConfirmed(): boolean {
    return this.#state.confirmedAt !== undefined;
  }

  get expiresAt(): Date {
    return this.#state.expiresAt;
  }

  isExpired(now: Date): boolean {
    return !this.isConfirmed && now.getTime() >= this.#state.expiresAt.getTime();
  }

  /** Lo que se guarda en la búsqueda del contacto: con envío automático y la frecuencia elegida. */
  savedSearchFields(): SavedSearchFields {
    return {
      ...this.#state.criteria,
      name: shorten(this.#state.summary, MAX_SAVED_SEARCH_NAME_LENGTH),
      opportunityId: undefined,
      autoSend: true,
      frequency: this.#state.frequency,
    };
  }

  /**
   * Confirmó el email: queda atada al contacto y a la búsqueda, y se borran su nombre y email.
   * Devuelve `false` si ya estaba confirmada (abrir el link dos veces no crea otra búsqueda).
   */
  confirm(
    result: {
      readonly clientId: ClientId;
      readonly savedSearchId: SavedSearchId;
      readonly agentId: string | undefined;
    },
    now: Date,
  ): Result<boolean, SearchSubscriptionExpiredError> {
    if (this.isConfirmed) return ok(false);
    if (this.isExpired(now)) return err({ type: 'SearchSubscriptionExpired' });
    this.#state = {
      ...this.#state,
      contact: undefined,
      confirmedAt: now,
      clientId: result.clientId,
      savedSearchId: result.savedSearchId,
    };
    this.#events.push({
      type: 'clients.search_subscribed',
      aggregateId: this.id,
      occurredAt: now,
      payload: {
        subscriptionId: this.id,
        clientId: result.clientId,
        savedSearchId: result.savedSearchId,
        agentId: result.agentId,
      },
    });
    return ok(true);
  }

  pullEvents(): SearchSubscribed[] {
    const events = this.#events;
    this.#events = [];
    return events;
  }

  toSnapshot(): SearchSubscriptionSnapshot {
    return { ...this.#state };
  }
}
