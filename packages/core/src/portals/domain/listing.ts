import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { ListingEvent } from './listing.events';
import type { PortalId } from './portal';

/** Lo que muestra el panel de una publicación: en qué quedó en el portal. */
export const LISTING_STATUSES = ['pending', 'published', 'paused', 'error', 'unpublished'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

/**
 * Lo que se pidió para el aviso: activo, pausado o cerrado. Cerrar es definitivo en el portal
 * (MercadoLibre no reactiva un aviso cerrado): volver a publicar arma un aviso nuevo.
 */
export const LISTING_INTENTS = ['active', 'paused', 'closed'] as const;
export type ListingIntent = (typeof LISTING_INTENTS)[number];

/** Simple o destacado: el nivel de exposición que se paga en el portal. */
export const LISTING_TYPES = ['simple', 'featured'] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

/** Un aviso por operación: venta y alquiler van en categorías distintas del portal. */
export const LISTING_OPERATIONS = ['sale', 'rent', 'temporary_rent'] as const;
export type ListingOperation = (typeof LISTING_OPERATIONS)[number];

/**
 * Qué permite hoy la propiedad: ofrecerse, quedar en pausa (reservada o pausada) o nada (vendida,
 * alquilada, retirada, borrador o en la papelera).
 */
export type OwnerAvailability = 'active' | 'paused' | 'closed';

/** El estado de la propiedad (módulo properties) visto por la publicación. */
export function ownerAvailability(status: string, isDeleted: boolean): OwnerAvailability {
  if (isDeleted) return 'closed';
  if (status === 'available') return 'active';
  if (status === 'reserved' || status === 'paused') return 'paused';
  return 'closed';
}

export type ListingId = Id<'Listing'>;

export interface ListingSnapshot {
  readonly id: ListingId;
  readonly portal: PortalId;
  /** Propiedad del módulo properties: solo el ID. */
  readonly propertyId: string;
  readonly operation: ListingOperation;
  readonly listingType: ListingType;
  readonly status: ListingStatus;
  readonly intent: ListingIntent;
  /** ID del aviso en el portal, una vez creado. */
  readonly externalId: string | undefined;
  readonly permalink: string | undefined;
  readonly lastError: string | undefined;
  /** Fallos seguidos desde la última sincronización buena. */
  readonly retryCount: number;
  readonly lastSyncedAt: Date | undefined;
  readonly publishedAt: Date | undefined;
  /** Huella de lo último que se mandó al portal: si no cambió, no se vuelve a mandar. */
  readonly contentHash: string | undefined;
  readonly createdAt: Date;
}

/** Lo que hay que hacer en el portal para dejar el aviso como corresponde. */
export type ListingSyncStep =
  | { readonly kind: 'create' }
  | { readonly kind: 'update'; readonly activate: boolean; readonly contentChanged: boolean }
  | { readonly kind: 'pause'; readonly contentChanged: boolean }
  | { readonly kind: 'close' }
  /** Nunca llegó al portal: no hay nada que llamar, solo dejar el estado. */
  | { readonly kind: 'mark'; readonly status: 'paused' | 'unpublished' }
  | { readonly kind: 'none' };

export interface ListingClosedError {
  readonly type: 'ListingClosed';
}

export interface ListingNotClosedError {
  readonly type: 'ListingNotClosed';
}

/** Publicación de una propiedad, en una operación, en un portal. */
export class Listing extends AggregateRoot<ListingId, ListingEvent> {
  #state: ListingSnapshot;

  private constructor(snapshot: ListingSnapshot) {
    super(snapshot.id);
    this.#state = snapshot;
  }

  /** Se pide publicar: queda pendiente hasta que el job lo crea en el portal. */
  static request(input: {
    readonly id: ListingId;
    readonly portal: PortalId;
    readonly propertyId: string;
    readonly operation: ListingOperation;
    readonly listingType: ListingType;
    readonly now: Date;
  }): Listing {
    const listing = new Listing({
      id: input.id,
      portal: input.portal,
      propertyId: input.propertyId,
      operation: input.operation,
      listingType: input.listingType,
      status: 'pending',
      intent: 'active',
      externalId: undefined,
      permalink: undefined,
      lastError: undefined,
      retryCount: 0,
      lastSyncedAt: undefined,
      publishedAt: undefined,
      contentHash: undefined,
      createdAt: input.now,
    });
    listing.requestSync(input.now);
    return listing;
  }

  static restore(snapshot: ListingSnapshot): Listing {
    return new Listing(snapshot);
  }

  get portal(): PortalId {
    return this.#state.portal;
  }

  get propertyId(): string {
    return this.#state.propertyId;
  }

  /** Cerrado en el portal y sin pedido de volver a publicar: no hay nada más que sincronizar. */
  get isFinished(): boolean {
    return this.#state.intent === 'closed' && this.#state.status === 'unpublished';
  }

  /** Pide sincronizar con el portal (lo hace un job). Un aviso terminado no se sincroniza. */
  requestSync(now: Date): void {
    if (this.isFinished) return;
    this.record({
      type: 'portals.listing_sync_requested',
      aggregateId: this.id,
      occurredAt: now,
      payload: { listingId: this.id, propertyId: this.#state.propertyId },
    });
  }

  /** Pausa el aviso en el portal. Uno cerrado no se pausa. */
  pause(now: Date): Result<boolean, ListingClosedError> {
    return this.#intend('paused', now);
  }

  /** Lo vuelve a activar después de pausarlo. Uno cerrado no se reactiva: se vuelve a publicar. */
  resume(now: Date): Result<boolean, ListingClosedError> {
    return this.#intend('active', now);
  }

  /** Lo da de baja en el portal. Es definitivo: para volver hay que publicar de nuevo. */
  unpublish(now: Date): boolean {
    if (this.#state.intent === 'closed') return false;
    this.#state = { ...this.#state, intent: 'closed' };
    this.requestSync(now);
    return true;
  }

  /** Vuelve a publicar un aviso dado de baja: es un aviso nuevo en el portal. */
  republish(listingType: ListingType, now: Date): Result<void, ListingNotClosedError> {
    if (this.#state.intent !== 'closed') return err({ type: 'ListingNotClosed' });
    this.#state = {
      ...this.#state,
      listingType,
      intent: 'active',
      status: 'pending',
      externalId: undefined,
      permalink: undefined,
      lastError: undefined,
      retryCount: 0,
      contentHash: undefined,
      publishedAt: undefined,
    };
    this.requestSync(now);
    return ok(undefined);
  }

  /** Simple o destacado. Sin cambios, devuelve `false`. */
  changeType(listingType: ListingType, now: Date): Result<boolean, ListingClosedError> {
    if (this.#state.intent === 'closed') return err({ type: 'ListingClosed' });
    if (this.#state.listingType === listingType) return ok(false);
    this.#state = { ...this.#state, listingType, contentHash: undefined };
    this.requestSync(now);
    return ok(true);
  }

  /**
   * Qué hacer en el portal: manda lo que se pidió y lo que permite la propiedad. Una propiedad que
   * ya no se ofrece cierra el aviso; reservada o pausada, lo pausa.
   */
  plan(owner: OwnerAvailability, contentHash: string): ListingSyncStep {
    const { intent, externalId, status } = this.#state;
    const contentChanged = contentHash !== this.#state.contentHash || status === 'error';
    const target: OwnerAvailability =
      intent === 'closed' || owner === 'closed'
        ? 'closed'
        : intent === 'paused' || owner === 'paused'
          ? 'paused'
          : 'active';

    if (target === 'closed') {
      if (externalId !== undefined && status !== 'unpublished') return { kind: 'close' };
      return status === 'unpublished' && intent === 'closed'
        ? { kind: 'none' }
        : { kind: 'mark', status: 'unpublished' };
    }
    if (externalId === undefined) {
      return target === 'active'
        ? { kind: 'create' }
        : status === 'paused'
          ? { kind: 'none' }
          : { kind: 'mark', status: 'paused' };
    }
    if (target === 'paused') {
      return status === 'paused' && !contentChanged
        ? { kind: 'none' }
        : { kind: 'pause', contentChanged };
    }
    const activate = status === 'paused';
    return activate || contentChanged
      ? { kind: 'update', activate, contentChanged }
      : { kind: 'none' };
  }

  /** El aviso se creó en el portal. */
  recordCreated(input: {
    readonly externalId: string;
    readonly permalink: string | undefined;
    readonly contentHash: string;
    readonly now: Date;
  }): void {
    this.#state = {
      ...this.#succeeded(input.now),
      status: 'published',
      externalId: input.externalId,
      permalink: input.permalink,
      contentHash: input.contentHash,
      publishedAt: input.now,
    };
  }

  /** El aviso quedó activo con el contenido de `contentHash`. */
  recordActive(contentHash: string, now: Date): void {
    this.#state = { ...this.#succeeded(now), status: 'published', contentHash };
  }

  /** El aviso quedó pausado (o nunca se creó y queda en pausa). */
  recordPaused(contentHash: string | undefined, now: Date): void {
    this.#state = {
      ...this.#succeeded(now),
      status: 'paused',
      contentHash: contentHash ?? this.#state.contentHash,
    };
  }

  /** El aviso quedó cerrado. Cerrar es definitivo: la intención pasa a cerrado. */
  recordClosed(now: Date): void {
    this.#state = { ...this.#succeeded(now), status: 'unpublished', intent: 'closed' };
  }

  /** El portal rechazó el cambio o no respondió. Queda el motivo a la vista. */
  recordFailure(reason: string, now: Date): void {
    this.#state = {
      ...this.#state,
      status: 'error',
      lastError: reason,
      retryCount: this.#state.retryCount + 1,
      lastSyncedAt: now,
    };
    this.record({
      type: 'portals.listing_sync_failed',
      aggregateId: this.id,
      occurredAt: now,
      payload: {
        listingId: this.id,
        propertyId: this.#state.propertyId,
        portal: this.#state.portal,
        reason,
      },
    });
  }

  toSnapshot(): ListingSnapshot {
    return this.#state;
  }

  #succeeded(now: Date): ListingSnapshot {
    return { ...this.#state, lastError: undefined, retryCount: 0, lastSyncedAt: now };
  }

  #intend(intent: 'active' | 'paused', now: Date): Result<boolean, ListingClosedError> {
    if (this.#state.intent === 'closed') return err({ type: 'ListingClosed' });
    if (this.#state.intent === intent) return ok(false);
    this.#state = { ...this.#state, intent };
    this.requestSync(now);
    return ok(true);
  }
}
