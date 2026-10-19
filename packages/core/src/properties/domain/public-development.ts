// Qué ve el público (la web) de un emprendimiento.

import type { DevelopmentStatus } from './development';
import type { PriceCurrency } from './property-catalog';

/** Solo se publican los que se están comercializando; "Cargando información" queda oculto. */
export const PUBLICLY_LISTED_DEVELOPMENT_STATUSES: readonly DevelopmentStatus[] = ['marketing'];

export interface DevelopmentVisibility {
  readonly status: DevelopmentStatus;
  readonly deletedAt: Date | null;
}

/** Un emprendimiento se muestra al público si se está comercializando y no está en la papelera. */
export function isDevelopmentPubliclyListed(development: DevelopmentVisibility): boolean {
  return (
    development.deletedAt === null &&
    PUBLICLY_LISTED_DEVELOPMENT_STATUSES.includes(development.status)
  );
}

export interface UnitPriceFrom {
  readonly currency: PriceCurrency;
  readonly amountCents: bigint;
}

/** Orden de preferencia del "desde": los emprendimientos se cotizan en dólares. */
const PRICE_FROM_CURRENCIES: readonly PriceCurrency[] = ['USD', 'ARS'];

/**
 * El "desde" de la tarjeta: el menor precio de venta visible entre sus unidades publicadas. Si hay
 * unidades en dólares y en pesos no se comparan entre sí: manda el dólar. `undefined` si ninguna
 * muestra su precio.
 */
export function developmentPriceFrom(
  minimums: readonly UnitPriceFrom[],
): UnitPriceFrom | undefined {
  for (const currency of PRICE_FROM_CURRENCIES) {
    const inCurrency = minimums.filter((m) => m.currency === currency);
    if (inCurrency.length === 0) continue;
    return inCurrency.reduce((min, m) => (m.amountCents < min.amountCents ? m : min));
  }
  return undefined;
}

export interface LocationLevel {
  readonly kind: string;
  readonly name: string;
}

export interface PublicPlace {
  readonly neighborhood: string;
  readonly city: string;
  readonly province: string;
}

/**
 * Barrio, localidad y provincia de un emprendimiento, desde la ruta de su ubicación (del país al
 * nivel elegido). El barrio es el nivel más chico: el sub-barrio si lo hay.
 */
export function placeFromPath(path: readonly LocationLevel[]): PublicPlace {
  const named = (kinds: readonly string[]) =>
    [...path].reverse().find((level) => kinds.includes(level.kind))?.name ?? '';
  return {
    neighborhood: named(['subneighborhood', 'neighborhood']),
    city: named(['city']),
    province: named(['province']),
  };
}
