import { err, ok, type Result } from '../../shared/domain/result';
import type { Id } from '../../shared/domain/id';
import type { Phone } from '../../shared/domain/value-objects/phone';

import type { ClientId } from './client';
import type { ListingReacted, ListingsSent } from './shared-listing.events';

export type SharedListingId = Id<'SharedListing'>;

/** Por dónde se le mandó el link al cliente. */
export const SHARED_LISTING_CHANNELS = ['email', 'whatsapp'] as const;
export type SharedListingChannel = (typeof SHARED_LISTING_CHANNELS)[number];

export const LISTING_REACTIONS = ['liked', 'disliked'] as const;
export type ListingReaction = (typeof LISTING_REACTIONS)[number];

/** Cuántos días se puede abrir el link de un envío (decisión de Norde, #104). */
export const SHARED_LISTING_LIFETIME_DAYS = 90;

/** Cuántas propiedades entran en un mismo envío. */
export const MAX_SHARED_PROPERTIES = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SharedListingItem {
  /** Propiedad del módulo properties, por ID. */
  readonly propertyId: string;
  readonly position: number;
  readonly firstOpenedAt: Date | undefined;
  readonly openCount: number;
  readonly reaction: ListingReaction | undefined;
  readonly reactedAt: Date | undefined;
}

export interface SharedListingSnapshot {
  readonly id: SharedListingId;
  /** Hash del token del link: el token en claro solo viaja en el link. */
  readonly tokenHash: string;
  readonly clientId: ClientId;
  /** La oportunidad abierta del cliente al enviarlo, por ID: la que mueven las reglas. */
  readonly opportunityId: string | undefined;
  readonly channel: SharedListingChannel;
  readonly sentBy: string;
  readonly sentAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | undefined;
  readonly items: readonly SharedListingItem[];
}

export type SharedListingAvailability = 'available' | 'expired' | 'revoked';

export interface NoListingsToSendError {
  readonly type: 'NoListingsToSend';
}

export interface TooManyListingsError {
  readonly type: 'TooManyListings';
  readonly max: number;
}

/** El link venció o se revocó: no se abre ni acepta reacciones. */
export interface SharedListingUnavailableError {
  readonly type: 'SharedListingUnavailable';
  readonly reason: 'expired' | 'revoked';
}

export interface ListingNotInSendError {
  readonly type: 'ListingNotInSend';
}

/**
 * Un envío de propiedades a un cliente por email o WhatsApp: un link público que vence a los
 * {@link SHARED_LISTING_LIFETIME_DAYS} días y se puede revocar antes. Registra cuántas veces lo
 * abrió y, por propiedad, si le gustó o no. Es del cliente: solo lo referencia por ID.
 */
export class SharedListing {
  #state: SharedListingSnapshot;
  #events: (ListingsSent | ListingReacted)[] = [];

  private constructor(state: SharedListingSnapshot) {
    this.#state = state;
  }

  static send(input: {
    readonly id: SharedListingId;
    readonly tokenHash: string;
    readonly clientId: ClientId;
    readonly opportunityId: string | undefined;
    readonly channel: SharedListingChannel;
    readonly propertyIds: readonly string[];
    readonly by: string;
    readonly now: Date;
  }): Result<SharedListing, NoListingsToSendError | TooManyListingsError> {
    const propertyIds = [...new Set(input.propertyIds.map((id) => id.toLowerCase()))];
    if (propertyIds.length === 0) return err({ type: 'NoListingsToSend' });
    if (propertyIds.length > MAX_SHARED_PROPERTIES) {
      return err({ type: 'TooManyListings', max: MAX_SHARED_PROPERTIES });
    }
    const listing = new SharedListing({
      id: input.id,
      tokenHash: input.tokenHash,
      clientId: input.clientId,
      opportunityId: input.opportunityId,
      channel: input.channel,
      sentBy: input.by,
      sentAt: input.now,
      expiresAt: new Date(input.now.getTime() + SHARED_LISTING_LIFETIME_DAYS * DAY_MS),
      revokedAt: undefined,
      items: propertyIds.map((propertyId, position) => ({
        propertyId,
        position,
        firstOpenedAt: undefined,
        openCount: 0,
        reaction: undefined,
        reactedAt: undefined,
      })),
    });
    listing.#events.push({
      type: 'clients.listings_sent',
      aggregateId: input.id,
      occurredAt: input.now,
      payload: {
        sharedListingId: input.id,
        clientId: input.clientId,
        opportunityId: input.opportunityId,
        channel: input.channel,
        propertyIds,
      },
    });
    return ok(listing);
  }

  static restore(snapshot: SharedListingSnapshot): SharedListing {
    return new SharedListing(snapshot);
  }

  get id(): SharedListingId {
    return this.#state.id;
  }

  get clientId(): ClientId {
    return this.#state.clientId;
  }

  get opportunityId(): string | undefined {
    return this.#state.opportunityId;
  }

  get propertyIds(): string[] {
    return this.#state.items.map((item) => item.propertyId);
  }

  availability(now: Date): SharedListingAvailability {
    return sharedListingAvailability(this.#state, now);
  }

  /** Se abrió el link: suma una apertura a cada propiedad. `first` si es la primera vez. */
  open(now: Date): Result<{ readonly first: boolean }, SharedListingUnavailableError> {
    const unavailable = this.#unavailable(now);
    if (unavailable) return err(unavailable);
    const first = this.#state.items.every((item) => item.firstOpenedAt === undefined);
    this.#state = {
      ...this.#state,
      items: this.#state.items.map((item) => ({
        ...item,
        firstOpenedAt: item.firstOpenedAt ?? now,
        openCount: item.openCount + 1,
      })),
    };
    return ok({ first });
  }

  /**
   * "Me gusta" o "no me gusta" a una propiedad del envío. Se puede cambiar de opinión; repetir la
   * misma reacción no cambia nada (devuelve `false`).
   */
  react(
    propertyId: string,
    reaction: ListingReaction,
    now: Date,
  ): Result<boolean, SharedListingUnavailableError | ListingNotInSendError> {
    const unavailable = this.#unavailable(now);
    if (unavailable) return err(unavailable);
    const id = propertyId.toLowerCase();
    const item = this.#state.items.find((candidate) => candidate.propertyId === id);
    if (!item) return err({ type: 'ListingNotInSend' });
    if (item.reaction === reaction) return ok(false);
    this.#state = {
      ...this.#state,
      items: this.#state.items.map((candidate) =>
        candidate.propertyId === id ? { ...candidate, reaction, reactedAt: now } : candidate,
      ),
    };
    this.#events.push({
      type: 'clients.listing_reacted',
      aggregateId: this.#state.id,
      occurredAt: now,
      payload: {
        sharedListingId: this.#state.id,
        clientId: this.#state.clientId,
        opportunityId: this.#state.opportunityId,
        propertyId: id,
        reaction,
      },
    });
    return ok(true);
  }

  /** Corta el link antes de que venza. Devuelve `false` si ya estaba revocado. */
  revoke(now: Date): boolean {
    if (this.#state.revokedAt !== undefined) return false;
    this.#state = { ...this.#state, revokedAt: now };
    return true;
  }

  pullEvents(): (ListingsSent | ListingReacted)[] {
    const events = this.#events;
    this.#events = [];
    return events;
  }

  toSnapshot(): SharedListingSnapshot {
    return { ...this.#state, items: this.#state.items.map((item) => ({ ...item })) };
  }

  #unavailable(now: Date): SharedListingUnavailableError | undefined {
    const availability = this.availability(now);
    return availability === 'available'
      ? undefined
      : { type: 'SharedListingUnavailable', reason: availability };
  }
}

/** Si el link se puede abrir: revocado gana a vencido. */
export function sharedListingAvailability(
  listing: { readonly expiresAt: Date; readonly revokedAt: Date | undefined },
  now: Date,
): SharedListingAvailability {
  if (listing.revokedAt !== undefined) return 'revoked';
  return now.getTime() >= listing.expiresAt.getTime() ? 'expired' : 'available';
}

/** El link público de un envío: `<sitio>/e/<token>`. */
export function sharedListingUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/e/${encodeURIComponent(token)}`;
}

/**
 * El link para darse de baja de los envíos automáticos: `<sitio>/e/<token>/baja`. Sirve el token
 * del mismo envío, aunque el link ya haya vencido.
 */
export function followUpUnsubscribeUrl(siteUrl: string, token: string): string {
  return `${sharedListingUrl(siteUrl, token)}/baja`;
}

/**
 * El número para `wa.me`: solo dígitos. A un celular argentino escrito sin el 9 de móvil
 * (`+54 11 …`, como queda cargado desde un formulario) se le agrega: WhatsApp lo necesita.
 */
export function whatsappNumber(phone: Phone): string {
  const digits = phone.e164.replace(/\D/g, '');
  const isArgentine = digits.startsWith('54');
  return isArgentine && !digits.startsWith('549') && digits.length === 12
    ? `549${digits.slice(2)}`
    : digits;
}

/** El link que abre el WhatsApp del asesor con el mensaje (y el link del envío) ya escrito. */
export function whatsappMessageUrl(phone: Phone, text: string): string {
  return `https://wa.me/${whatsappNumber(phone)}?text=${encodeURIComponent(text)}`;
}
