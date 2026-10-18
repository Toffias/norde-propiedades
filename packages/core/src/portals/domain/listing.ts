import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { ListingEvent } from './listing.events';
import type { ListingOwnerKind, PortalId } from './portal';

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

/**
 * Las operaciones que puede llevar un aviso. En los portales con un aviso por operación (ML), cada
 * publicación tiene la suya; en los de un aviso por propiedad (Zonaprop), no tiene ninguna y lleva
 * todas las operaciones con precio.
 */
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

/**
 * Qué permite hoy el emprendimiento: se ofrece mientras está "comercializando" y tiene alguna
 * unidad para publicar; cargando información o sin unidades, queda en pausa (vuelve solo cuando hay
 * unidades). En la papelera, nada.
 */
export function developmentAvailability(input: {
  readonly status: string;
  readonly isDeleted: boolean;
  readonly publishableUnits: number;
}): OwnerAvailability {
  if (input.isDeleted) return 'closed';
  if (input.status !== 'marketing' || input.publishableUnits === 0) return 'paused';
  return 'active';
}

/**
 * Cómo está el aviso en el portal, leído del portal (la conciliación diaria): activo, pausado
 * (por el portal o por alguien en su sitio) o cerrado (vencido, dado de baja allá).
 */
export interface RemoteListingState {
  readonly state: 'active' | 'paused' | 'closed';
  /** Por qué lo pausó o lo cerró el portal ("MercadoLibre venció el aviso."), para mostrarlo. */
  readonly reason: string | undefined;
}

export type ListingId = Id<'Listing'>;

/** Lo que se publica: una propiedad suelta o un emprendimiento con sus unidades (por ID). */
export interface ListingOwner {
  readonly kind: ListingOwnerKind;
  readonly id: string;
}

export interface ListingSnapshot {
  readonly id: ListingId;
  readonly portal: PortalId;
  /** La propiedad o el emprendimiento del módulo properties: solo el ID. */
  readonly owner: ListingOwner;
  /** Sin operación: el aviso lleva todas las operaciones de la propiedad (Zonaprop). */
  readonly operation: ListingOperation | undefined;
  readonly listingType: ListingType;
  /** El plan del portal, en los que se elige entre los contratados (en Zonaprop, `SIMPLE`…). */
  readonly plan: string | undefined;
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

/**
 * Publicación de una propiedad en un portal (de una operación, o de todas en un solo aviso) o de un
 * emprendimiento con sus unidades.
 */
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
    readonly owner: ListingOwner;
    readonly operation: ListingOperation | undefined;
    readonly listingType: ListingType;
    readonly plan: string | undefined;
    readonly now: Date;
  }): Listing {
    const listing = new Listing({
      id: input.id,
      portal: input.portal,
      owner: input.owner,
      operation: input.operation,
      listingType: input.listingType,
      plan: input.plan,
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

  /**
   * Un aviso que ya estaba online en el portal (lo publicó otro sistema) y Norde toma, sin
   * republicarlo. La huella es la del contenido de hoy: el aviso queda como estaba hasta que cambie
   * algo de la propiedad, y ahí lo actualiza Norde. No pide sincronizar.
   */
  static linked(input: {
    readonly id: ListingId;
    readonly portal: PortalId;
    readonly owner: ListingOwner;
    readonly operation: ListingOperation | undefined;
    readonly plan: string | undefined;
    readonly externalId: string;
    readonly permalink: string | undefined;
    readonly contentHash: string;
    readonly now: Date;
  }): Listing {
    return new Listing({
      id: input.id,
      portal: input.portal,
      owner: input.owner,
      operation: input.operation,
      listingType: 'simple',
      plan: input.plan,
      status: 'published',
      intent: 'active',
      externalId: input.externalId,
      permalink: input.permalink,
      lastError: undefined,
      retryCount: 0,
      lastSyncedAt: input.now,
      publishedAt: input.now,
      contentHash: input.contentHash,
      createdAt: input.now,
    });
  }

  static restore(snapshot: ListingSnapshot): Listing {
    return new Listing(snapshot);
  }

  get portal(): PortalId {
    return this.#state.portal;
  }

  get owner(): ListingOwner {
    return this.#state.owner;
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
      payload: {
        listingId: this.id,
        ownerKind: this.#state.owner.kind,
        ownerId: this.#state.owner.id,
      },
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

  /**
   * Toma un aviso que ya estaba online en el portal para una publicación dada de baja (como
   * `Listing.linked`, sobre la que ya existía). Solo desde una publicación cerrada.
   */
  adopt(input: {
    readonly plan: string | undefined;
    readonly externalId: string;
    readonly permalink: string | undefined;
    readonly contentHash: string;
    readonly now: Date;
  }): Result<void, ListingNotClosedError> {
    if (this.#state.intent !== 'closed') return err({ type: 'ListingNotClosed' });
    this.#state = {
      ...this.#state,
      plan: input.plan,
      status: 'published',
      intent: 'active',
      externalId: input.externalId,
      permalink: input.permalink,
      lastError: undefined,
      retryCount: 0,
      lastSyncedAt: input.now,
      publishedAt: input.now,
      contentHash: input.contentHash,
    };
    return ok(undefined);
  }

  /** Vuelve a publicar un aviso dado de baja: es un aviso nuevo en el portal. */
  republish(
    exposure: { readonly listingType: ListingType; readonly plan: string | undefined },
    now: Date,
  ): Result<void, ListingNotClosedError> {
    if (this.#state.intent !== 'closed') return err({ type: 'ListingNotClosed' });
    this.#state = {
      ...this.#state,
      listingType: exposure.listingType,
      plan: exposure.plan,
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

  /** Cambia el plan (en Zonaprop, consume un crédito del plan nuevo). Sin cambios, `false`. */
  changePlan(plan: string, now: Date): Result<boolean, ListingClosedError> {
    if (this.#state.intent === 'closed') return err({ type: 'ListingClosed' });
    if (this.#state.plan === plan) return ok(false);
    this.#state = { ...this.#state, plan, contentHash: undefined };
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

  /** El aviso quedó activo con el contenido de `contentHash`; con `permalink`, el link nuevo. */
  recordActive(contentHash: string, now: Date, permalink?: string): void {
    this.#state = {
      ...this.#succeeded(now),
      status: 'published',
      contentHash,
      permalink: permalink ?? this.#state.permalink,
    };
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

  /**
   * Refleja lo que pasó en el portal sin que Norde lo pidiera (la conciliación diaria). Devuelve si
   * la publicación cambió.
   * - Cerrado allá (vencido, dado de baja): queda dada de baja, con el motivo. Volver a mostrarlo
   *   es "Volver a publicar", como cualquier aviso cerrado.
   * - Pausado allá (moderación, o alguien lo pausó en el portal): queda pausada, con el motivo si el
   *   equipo lo quería activo. No se reactiva sola: hay que resolverlo en el portal y sincronizar.
   * - Activo allá: si estaba pausada por el portal, vuelve a publicada; si el equipo la había
   *   pausado, se pide sincronizar para pausarlo otra vez. Un error de la última sincronización
   *   queda a la vista: es sobre el contenido, no sobre el estado.
   * Las que nunca llegaron al portal o ya están dadas de baja no se tocan.
   */
  reconcile(remote: RemoteListingState, now: Date): boolean {
    const { externalId, status, intent, lastError } = this.#state;
    if (externalId === undefined || status === 'pending' || status === 'unpublished') return false;

    if (remote.state === 'closed') {
      this.#state = {
        ...this.#state,
        status: 'unpublished',
        intent: 'closed',
        lastError: remote.reason,
        lastSyncedAt: now,
      };
      return true;
    }
    if (remote.state === 'paused') {
      const reason = intent === 'paused' ? undefined : remote.reason;
      if (status === 'paused' && lastError === reason) return false;
      this.#state = { ...this.#state, status: 'paused', lastError: reason, lastSyncedAt: now };
      return true;
    }
    if (intent === 'paused') {
      if (status === 'published') return false;
      this.#state = {
        ...this.#state,
        status: 'published',
        lastError: undefined,
        lastSyncedAt: now,
      };
      this.requestSync(now);
      return true;
    }
    if (status !== 'paused') return false;
    this.#state = { ...this.#state, status: 'published', lastError: undefined, lastSyncedAt: now };
    return true;
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
        ownerKind: this.#state.owner.kind,
        ownerId: this.#state.owner.id,
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
