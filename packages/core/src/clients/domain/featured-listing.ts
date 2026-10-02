import type { Id } from '../../shared/domain/id';

import type { ClientId } from './client';

export type FeaturedListingId = Id<'FeaturedListing'>;

export interface FeaturedListingSnapshot {
  readonly id: FeaturedListingId;
  readonly clientId: ClientId;
  /** Propiedad del módulo properties, por ID. */
  readonly propertyId: string;
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
    readonly by: string;
    readonly now: Date;
  }): FeaturedListing {
    return new FeaturedListing({
      id: input.id,
      clientId: input.clientId,
      propertyId: input.propertyId.toLowerCase(),
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
