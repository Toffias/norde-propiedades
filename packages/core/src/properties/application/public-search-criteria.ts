import type { CompanySettingsReader } from '../../settings';
import { CURRENCIES, type Currency, type SearchPropertiesInputSchema } from '../contracts';
import { PUBLICLY_LISTED_STATUSES } from '../domain/property-status';
import {
  ageRange,
  countOptionRanges,
  priceBoundsByCurrency,
  type PriceBounds,
} from '../domain/public-search';

import type { PropertyFilterCriteria } from './ports/property-search-query';

type ParsedFilters = Omit<
  ReturnType<typeof SearchPropertiesInputSchema.parse>,
  'sort' | 'page' | 'pageSize'
>;

/**
 * La cotización del dólar de la empresa (centavos de peso por dólar), solo si hace falta: hay
 * filtro de precio. Sin lector de configuración o sin cotización cargada, no se convierte.
 */
export async function exchangeRateFor(
  filters: Pick<ParsedFilters, 'minPriceCents' | 'maxPriceCents'>,
  settings: CompanySettingsReader | undefined,
): Promise<bigint | undefined> {
  if (filters.minPriceCents === undefined && filters.maxPriceCents === undefined) return undefined;
  return (await settings?.get())?.toSnapshot().usdExchangeRate?.arsCentsPerUsd;
}

/**
 * Los filtros de la búsqueda pública (web y agente) como criterios del puerto: el stock que se
 * ofrece, las opciones de la web como rangos y el precio en las monedas que correspondan.
 */
export function toPublicFilterCriteria(
  filters: ParsedFilters,
  arsCentsPerUsd: bigint | undefined,
): PropertyFilterCriteria {
  const {
    currency,
    minPriceCents,
    maxPriceCents,
    rooms,
    bedrooms,
    bathrooms,
    age,
    furnished,
    withParking,
    ...rest
  } = filters;
  const filtersPrice = minPriceCents !== undefined || maxPriceCents !== undefined;
  return {
    ...rest,
    statuses: PUBLICLY_LISTED_STATUSES,
    publishedOnWebOnly: true,
    ...(filtersPrice && {
      priceBounds: priceBounds(currency, minPriceCents, maxPriceCents, arsCentsPerUsd),
    }),
    ...(rooms && { roomRanges: countOptionRanges('rooms', rooms) }),
    ...(bedrooms && { bedroomRanges: countOptionRanges('bedrooms', bedrooms) }),
    ...(bathrooms && { bathroomRanges: countOptionRanges('bathrooms', bathrooms) }),
    ...(age && { age: ageRange(age) }),
    ...(furnished && { furnished: true }),
    ...(withParking && { withParking: true }),
  };
}

function priceBounds(
  currency: Currency | undefined,
  minCents: bigint | undefined,
  maxCents: bigint | undefined,
  arsCentsPerUsd: bigint | undefined,
): PriceBounds[] {
  const bounds = (c: Currency): PriceBounds => ({
    currency: c,
    ...(minCents !== undefined && { minCents }),
    ...(maxCents !== undefined && { maxCents }),
  });
  // Sin moneda (el agente a veces no la sabe), el rango vale tal cual en cualquiera.
  if (currency === undefined) return CURRENCIES.map(bounds);
  return priceBoundsByCurrency(bounds(currency), arsCentsPerUsd);
}
