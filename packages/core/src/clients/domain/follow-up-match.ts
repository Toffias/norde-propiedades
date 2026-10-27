import type { Id } from '../../shared/domain/id';

import type { ClientId } from './client';
import type { FeaturedListingId } from './featured-listing';
import type { SavedSearchId } from './saved-search';

export type FollowUpMatchId = Id<'FollowUpMatch'>;

/**
 * Por qué una propiedad entra en los seguimientos automáticos de un cliente: es nueva para una de
 * sus búsquedas o le bajaron el precio (a una que coincide con sus búsquedas o a una destacada).
 */
export const FOLLOW_UP_REASONS = ['new_listing', 'price_drop'] as const;
export type FollowUpReason = (typeof FOLLOW_UP_REASONS)[number];

/** Qué la hizo coincidir: una búsqueda guardada con envío automático o una destacada. */
export type FollowUpSource =
  | { readonly kind: 'saved_search'; readonly savedSearchId: SavedSearchId }
  | { readonly kind: 'featured'; readonly featuredListingId: FeaturedListingId };

/** El precio de la operación que coincidió, al detectarla. */
export interface FollowUpPrice {
  readonly operation: string;
  readonly currency: string;
  readonly priceCents: bigint | undefined;
}

/**
 * Una propiedad que el cruce con el stock encontró para un cliente y que todavía hay que mandarle
 * (el envío llega en #106, etapa 2). Una propiedad entra una sola vez por cliente como nueva, y
 * una vez por cada precio al que bajó: el repositorio descarta la repetida.
 */
export interface FollowUpMatch {
  readonly id: FollowUpMatchId;
  readonly clientId: ClientId;
  /** Propiedad del módulo properties, por ID. */
  readonly propertyId: string;
  readonly reason: FollowUpReason;
  readonly source: FollowUpSource;
  readonly price: FollowUpPrice;
  readonly detectedAt: Date;
}

/**
 * Bajó el precio: los dos precios están cargados y el nuevo es menor. Un cambio de moneda llega
 * sin precio anterior (no se comparan) y una suba no se avisa.
 */
export function isPriceDrop(
  oldPriceCents: bigint | undefined,
  newPriceCents: bigint | undefined,
): boolean {
  return (
    oldPriceCents !== undefined && newPriceCents !== undefined && newPriceCents < oldPriceCents
  );
}

/** El precio de una operación de la propiedad, para guardarlo con la coincidencia. */
export function followUpPrice(
  operations: readonly {
    readonly operation: string;
    readonly currency: string;
    readonly priceCents: bigint | undefined;
  }[],
  operation: string,
): FollowUpPrice | undefined {
  const found = operations.find((o) => o.operation === operation);
  return found === undefined
    ? undefined
    : { operation: found.operation, currency: found.currency, priceCents: found.priceCents };
}
