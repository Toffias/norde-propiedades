import type { Id } from '../../shared/domain/id';

import type { ClientId } from './client';
import type { OpportunityListingsFeatured } from './opportunity.events';

export type FeaturedListingId = Id<'FeaturedListing'>;

export interface FeaturedListingSnapshot {
  readonly id: FeaturedListingId;
  readonly clientId: ClientId;
  /** Propiedad del módulo properties, por ID. */
  readonly propertyId: string;
  /** La oportunidad abierta del cliente al destacarla, por ID. */
  readonly opportunityId: string | undefined;
  /** Coincidencia con su mejor búsqueda guardada al destacarla (`bestMatchScore`). */
  readonly matchScore: number | undefined;
  /** Si el cliente recibe por email los cambios de la propiedad (#11, etapa 4). */
  readonly autoSendUpdates: boolean;
  readonly featuredBy: string;
  readonly featuredAt: Date;
  readonly removedAt: Date | undefined;
  readonly updatedAt: Date;
}

/**
 * Una propiedad destacada para un cliente: la que el asesor le ofrece. Una misma propiedad está
 * destacada una sola vez por cliente; quitarla la deja como quitada (no se borra) y destacarla
 * otra vez crea una nueva.
 */
export class FeaturedListing {
  #state: FeaturedListingSnapshot;

  private constructor(state: FeaturedListingSnapshot) {
    this.#state = state;
  }

  static feature(input: {
    readonly id: FeaturedListingId;
    readonly clientId: ClientId;
    readonly propertyId: string;
    readonly opportunityId: string | undefined;
    readonly matchScore: number | undefined;
    readonly by: string;
    readonly now: Date;
  }): FeaturedListing {
    return new FeaturedListing({
      id: input.id,
      clientId: input.clientId,
      propertyId: input.propertyId.toLowerCase(),
      opportunityId: input.opportunityId,
      matchScore: input.matchScore,
      autoSendUpdates: false,
      featuredBy: input.by,
      featuredAt: input.now,
      removedAt: undefined,
      updatedAt: input.now,
    });
  }

  static restore(snapshot: FeaturedListingSnapshot): FeaturedListing {
    return new FeaturedListing(snapshot);
  }

  get id(): FeaturedListingId {
    return this.#state.id;
  }

  get propertyId(): string {
    return this.#state.propertyId;
  }

  get isActive(): boolean {
    return this.#state.removedAt === undefined;
  }

  get autoSendUpdates(): boolean {
    return this.#state.autoSendUpdates;
  }

  /** Devuelve `false` si ya estaba así. */
  setAutoSendUpdates(enabled: boolean, now: Date): boolean {
    if (this.#state.autoSendUpdates === enabled) return false;
    this.#state = { ...this.#state, autoSendUpdates: enabled, updatedAt: now };
    return true;
  }

  /** Devuelve `false` si ya estaba quitada. */
  remove(now: Date): boolean {
    if (!this.isActive) return false;
    this.#state = { ...this.#state, removedAt: now, updatedAt: now };
    return true;
  }

  toSnapshot(): FeaturedListingSnapshot {
    return { ...this.#state };
  }
}

/** De las propiedades pedidas, las que todavía no están destacadas (sin repetir). */
export function propertiesToFeature(
  requested: readonly string[],
  active: readonly FeaturedListing[],
): string[] {
  const already = new Set(active.filter((f) => f.isActive).map((f) => f.propertyId));
  return [...new Set(requested.map((id) => id.toLowerCase()))].filter((id) => !already.has(id));
}

/**
 * Se le destacaron propiedades a un cliente con una oportunidad abierta: dispara la regla "al
 * reactivar" si estaba derivada a una socia.
 */
export function listingsFeaturedEvent(input: {
  readonly opportunityId: string;
  readonly clientId: ClientId;
  readonly propertyIds: readonly string[];
  readonly now: Date;
}): OpportunityListingsFeatured {
  return {
    type: 'clients.opportunity_listings_featured',
    aggregateId: input.opportunityId,
    occurredAt: input.now,
    payload: {
      opportunityId: input.opportunityId,
      clientId: input.clientId,
      propertyIds: [...input.propertyIds],
    },
  };
}
