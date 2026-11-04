// Reglas de los filtros del buscador público (web): opciones de ambientes, dormitorios y baños,
// antigüedad y conversión de precios entre pesos y dólares.

import type { PriceCurrency as Currency } from './property-catalog';

/** Un rango cerrado de enteros; sin `max`, "o más". */
export interface CountRange {
  readonly min: number;
  readonly max?: number;
}

/**
 * Opciones de ambientes, dormitorios y baños: 1, 2, … y la última es "N o más". Así "3 o más" no
 * se pisa con las anteriores y se pueden elegir varias a la vez ("2 o 3 ambientes").
 */
export const COUNT_OPTION_LIMITS = { rooms: 4, bedrooms: 3, bathrooms: 3 } as const;
export type CountFacet = keyof typeof COUNT_OPTION_LIMITS;

/** Las opciones de un filtro de cantidad: `[1, 2, 3, 4]` para ambientes. */
export function countOptions(facet: CountFacet): readonly number[] {
  return Array.from({ length: COUNT_OPTION_LIMITS[facet] }, (_, index) => index + 1);
}

/** El rango de una opción: la última es "o más". */
export function countOptionRange(facet: CountFacet, option: number): CountRange {
  return option >= COUNT_OPTION_LIMITS[facet] ? { min: option } : { min: option, max: option };
}

/** Las opciones elegidas como rangos, sin repetir. */
export function countOptionRanges(facet: CountFacet, options: readonly number[]): CountRange[] {
  return [...new Set(options)].sort((a, b) => a - b).map((o) => countOptionRange(facet, o));
}

/**
 * Antigüedad: "a estrenar" son las nuevas (0 años o en estado "a estrenar"); las demás son por
 * años, y "hasta 5 años" incluye las a estrenar.
 */
export const AGE_OPTIONS = ['brand_new', 'up_to_5', 'up_to_10', 'up_to_20', 'over_20'] as const;
export type AgeOption = (typeof AGE_OPTIONS)[number];

export type AgeRange =
  | { readonly kind: 'brand_new' }
  | { readonly kind: 'years'; readonly min?: number; readonly max?: number };

export function ageRange(option: AgeOption): AgeRange {
  switch (option) {
    case 'brand_new':
      return { kind: 'brand_new' };
    case 'up_to_5':
      return { kind: 'years', max: 5 };
    case 'up_to_10':
      return { kind: 'years', max: 10 };
    case 'up_to_20':
      return { kind: 'years', max: 20 };
    case 'over_20':
      return { kind: 'years', min: 21 };
  }
}

/** Un rango de precio en una moneda, en centavos. */
export interface PriceBounds {
  readonly currency: Currency;
  readonly minCents?: bigint;
  readonly maxCents?: bigint;
}

/**
 * El rango de precio pedido en cada moneda. Con cotización, un rango en pesos también busca las
 * publicadas en dólares (convertidas con la cotización) y al revés: 60.000 USD a $1.450 son
 * $87.000.000. Los bordes se redondean para no dejar afuera una que entra: el mínimo hacia
 * arriba y el máximo hacia abajo, en la otra moneda. Sin cotización, solo la moneda pedida.
 *
 * `arsCentsPerUsd`: centavos de peso por dólar (1.450,50 → 145050n).
 */
export function priceBoundsByCurrency(
  requested: PriceBounds,
  arsCentsPerUsd: bigint | undefined,
): PriceBounds[] {
  if (arsCentsPerUsd === undefined || arsCentsPerUsd <= 0n) return [requested];
  const other: Currency = requested.currency === 'ARS' ? 'USD' : 'ARS';
  // De pesos a dólares: centavos ARS × 100 / tasa. De dólares a pesos: centavos USD × tasa / 100.
  const toOther = (cents: bigint, roundUp: boolean): bigint => {
    const [numerator, denominator] =
      requested.currency === 'ARS'
        ? [cents * 100n, arsCentsPerUsd]
        : [cents * arsCentsPerUsd, 100n];
    const quotient = numerator / denominator;
    return roundUp && numerator % denominator !== 0n ? quotient + 1n : quotient;
  };
  return [
    requested,
    {
      currency: other,
      ...(requested.minCents !== undefined && { minCents: toOther(requested.minCents, true) }),
      ...(requested.maxCents !== undefined && { maxCents: toOther(requested.maxCents, false) }),
    },
  ];
}
