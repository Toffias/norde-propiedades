import type {
  Currency,
  GetPublicPropertyMapInput,
  MapArea,
  Operation,
  PropertyType,
  PublicSort,
  SearchPropertiesInput,
} from '@norde/core/properties/contracts';

import { routes } from '../seo/routes';
import { OPERATION_PHRASES, PROPERTY_TYPE_PLURALS } from './labels';
import {
  OPERATION_OPTIONS,
  operationFromParam,
  PROPERTY_TYPE_OPTIONS,
  propertyTypeFromParam,
  SEARCH_PARAM_NAMES,
} from './search-params';

// Los filtros del listado viven en la URL (`/propiedades?operacion=venta&ambientes=3`): se
// comparten, se indexan y funcionan sin JavaScript. Un valor inválido se ignora, no da error.

/** Tarjetas por página del listado. */
export const LISTING_PAGE_SIZE = 12;

export const LISTING_PARAM_NAMES = {
  ...SEARCH_PARAM_NAMES,
  currency: 'moneda',
  minPrice: 'desde',
  maxPrice: 'hasta',
  minRooms: 'ambientes',
  minBedrooms: 'dormitorios',
  sort: 'orden',
  page: 'pagina',
  /** Área del mapa: `sur,oeste,norte,este`. */
  area: 'area',
  view: 'vista',
} as const;

/** `?vista=mapa`; sin el parámetro, la grilla. */
export const MAP_VIEW_PARAM = 'mapa';

export const SORT_OPTIONS: readonly { value: PublicSort; param: string; label: string }[] = [
  { value: 'featured', param: 'destacadas', label: 'Destacadas' },
  { value: 'newest', param: 'recientes', label: 'Más recientes' },
  { value: 'price_asc', param: 'menor-precio', label: 'Menor precio' },
  { value: 'price_desc', param: 'mayor-precio', label: 'Mayor precio' },
  { value: 'surface_desc', param: 'mayor-superficie', label: 'Mayor superficie' },
];

export const CURRENCY_OPTIONS: readonly { value: Currency; param: string; label: string }[] = [
  { value: 'USD', param: 'usd', label: 'USD' },
  { value: 'ARS', param: 'ars', label: '$' },
];

/** "Desde 1 ambiente" … "5 o más". */
export const ROOM_OPTIONS = [1, 2, 3, 4, 5] as const;

export interface ListingFilters {
  readonly operation?: Operation;
  readonly propertyType?: PropertyType;
  /** Texto libre: solo si no coincidió con ninguna ubicación del catálogo. */
  readonly location?: string;
  /** Ubicación del catálogo: incluye sus barrios. */
  readonly locationId?: string;
  /** "Buscar en esta zona" del mapa. */
  readonly area?: MapArea;
  readonly currency?: Currency;
  /** En unidades (sin centavos): lo que escribe la persona. */
  readonly minPrice?: number;
  readonly maxPrice?: number;
  readonly minRooms?: number;
  readonly minBedrooms?: number;
  readonly sort: PublicSort;
  readonly page: number;
  /** Sin valor: la grilla. */
  readonly view?: 'map';
}

export type SearchParamsRecord = Readonly<Record<string, string | string[] | undefined>>;

function single(params: SearchParamsRecord, name: string): string | undefined {
  const value = params[name];
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = first?.trim();
  return trimmed === '' ? undefined : trimmed;
}

function wholeNumber(value: string | undefined, max: number): number | undefined {
  if (value === undefined) return undefined;
  const digits = value.replace(/[.\s]/g, '');
  if (!/^\d{1,12}$/.test(digits)) return undefined;
  const parsed = Number(digits);
  return parsed > 0 && parsed <= max ? parsed : undefined;
}

const MAX_PRICE = 100_000_000_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Decimales del área en la URL: unos 10 m, y una URL corta y estable. */
const AREA_DECIMALS = 4;

function roundCoordinate(value: number): number {
  const factor = 10 ** AREA_DECIMALS;
  return Math.round(value * factor) / factor;
}

/** `sur,oeste,norte,este`, con el sur al sur del norte y el oeste al oeste del este. */
function parseArea(value: string | undefined): MapArea | undefined {
  const parts = value?.split(',') ?? [];
  if (parts.length !== 4) return undefined;
  const [south, west, north, east] = parts.map((part) => roundCoordinate(Number(part)));
  if (south === undefined || west === undefined || north === undefined || east === undefined) {
    return undefined;
  }
  const inRange =
    Math.abs(south) <= 90 &&
    Math.abs(north) <= 90 &&
    Math.abs(west) <= 180 &&
    Math.abs(east) <= 180;
  // `NaN` no pasa ninguna comparación: un número inválido deja el área afuera.
  return inRange && south < north && west < east ? { south, west, north, east } : undefined;
}

export function formatArea(area: MapArea): string {
  return [area.south, area.west, area.north, area.east].map(roundCoordinate).join(',');
}

export function parseListingFilters(params: SearchParamsRecord): ListingFilters {
  const n = LISTING_PARAM_NAMES;
  const location = single(params, n.location)?.slice(0, 100);
  const locationId = single(params, n.locationId)?.toLowerCase();
  const area = parseArea(single(params, n.area));
  const filters: {
    -readonly [K in keyof ListingFilters]: ListingFilters[K];
  } = {
    sort: SORT_OPTIONS.find((o) => o.param === single(params, n.sort))?.value ?? 'featured',
    page: wholeNumber(single(params, n.page), 1000) ?? 1,
  };
  const operation = operationFromParam(single(params, n.operation));
  const propertyType = propertyTypeFromParam(single(params, n.propertyType));
  const currency = CURRENCY_OPTIONS.find((o) => o.param === single(params, n.currency))?.value;
  const minPrice = wholeNumber(single(params, n.minPrice), MAX_PRICE);
  const maxPrice = wholeNumber(single(params, n.maxPrice), MAX_PRICE);
  const minRooms = wholeNumber(single(params, n.minRooms), 50);
  const minBedrooms = wholeNumber(single(params, n.minBedrooms), 50);
  if (operation) filters.operation = operation;
  if (propertyType) filters.propertyType = propertyType;
  if (locationId && UUID.test(locationId)) filters.locationId = locationId;
  // Con una ubicación del catálogo, el texto sobra: es su nombre.
  else if (location) filters.location = location;
  if (area) filters.area = area;
  if (single(params, n.view) === MAP_VIEW_PARAM) filters.view = 'map';
  if (currency) filters.currency = currency;
  if (minPrice !== undefined) filters.minPrice = minPrice;
  if (maxPrice !== undefined) filters.maxPrice = maxPrice;
  if (minRooms !== undefined) filters.minRooms = minRooms;
  if (minBedrooms !== undefined) filters.minBedrooms = minBedrooms;
  return filters;
}

/** La moneda del filtro de precio: la elegida o, si no, la habitual de la operación. */
export function priceCurrency(filters: ListingFilters): Currency {
  if (filters.currency) return filters.currency;
  return filters.operation === 'rent' || filters.operation === 'temporary_rent' ? 'ARS' : 'USD';
}

/** Los filtros de la URL como input del mapa: los mismos que la grilla, sin orden ni página. */
export function toMapInput(filters: ListingFilters): GetPublicPropertyMapInput {
  const hasPrice = filters.minPrice !== undefined || filters.maxPrice !== undefined;
  return {
    ...(filters.operation && { operation: filters.operation }),
    ...(filters.propertyType && { propertyType: filters.propertyType }),
    ...(filters.location && { location: filters.location }),
    ...(filters.locationId && { locationId: filters.locationId }),
    ...(filters.area && { area: filters.area }),
    ...(hasPrice && { currency: priceCurrency(filters) }),
    ...(filters.minPrice !== undefined && { minPriceCents: BigInt(filters.minPrice) * 100n }),
    ...(filters.maxPrice !== undefined && { maxPriceCents: BigInt(filters.maxPrice) * 100n }),
    ...(filters.minRooms !== undefined && { minRooms: filters.minRooms }),
    ...(filters.minBedrooms !== undefined && { minBedrooms: filters.minBedrooms }),
  };
}

export function toSearchInput(filters: ListingFilters, pageSize: number): SearchPropertiesInput {
  return {
    ...toMapInput(filters),
    sort: filters.sort,
    page: filters.page,
    pageSize,
  };
}

/**
 * El link del listado con estos filtros. Cambiar un filtro vuelve a la página 1; los valores por
 * defecto (orden destacadas, página 1) no se escriben, así hay una sola URL por búsqueda.
 */
export function listingHref(
  filters: ListingFilters,
  changes: Partial<{ -readonly [K in keyof ListingFilters]: ListingFilters[K] | undefined }> = {},
): string {
  const next = { ...filters, page: 1, ...changes };
  const n = LISTING_PARAM_NAMES;
  const query = new URLSearchParams();
  const set = (name: string, value: string | number | undefined) => {
    if (value !== undefined) query.set(name, String(value));
  };
  set(n.operation, OPERATION_OPTIONS.find((o) => o.value === next.operation)?.param);
  set(n.propertyType, PROPERTY_TYPE_OPTIONS.find((o) => o.value === next.propertyType)?.param);
  set(n.location, next.location);
  set(n.locationId, next.locationId);
  set(n.currency, CURRENCY_OPTIONS.find((o) => o.value === next.currency)?.param);
  set(n.minPrice, next.minPrice);
  set(n.maxPrice, next.maxPrice);
  set(n.minRooms, next.minRooms);
  set(n.minBedrooms, next.minBedrooms);
  if (next.sort !== undefined && next.sort !== 'featured') {
    set(n.sort, SORT_OPTIONS.find((o) => o.value === next.sort)?.param);
  }
  if (next.page !== undefined && next.page > 1) set(n.page, next.page);
  if (next.area !== undefined) set(n.area, formatArea(next.area));
  if (next.view === 'map') set(n.view, MAP_VIEW_PARAM);
  const search = query.toString();
  return search === '' ? routes.properties() : `${routes.properties()}?${search}`;
}

/** Cuántos filtros eligió la persona (sin contar orden ni página): para el botón "Filtros (3)". */
export function activeFilterCount(filters: ListingFilters): number {
  return [
    filters.operation,
    filters.propertyType,
    filters.location ?? filters.locationId,
    filters.area,
    filters.minPrice,
    filters.maxPrice,
    filters.minRooms,
    filters.minBedrooms,
  ].filter((value) => value !== undefined).length;
}

/**
 * Título del listado según los filtros: "Departamentos en venta en Mataderos". `locationName`:
 * el nombre de la ubicación del catálogo elegida.
 */
export function listingTitle(filters: ListingFilters, locationName?: string): string {
  const what = filters.propertyType ? PROPERTY_TYPE_PLURALS[filters.propertyType] : 'Propiedades';
  const operation = filters.operation
    ? OPERATION_PHRASES[filters.operation]
    : 'en venta y alquiler';
  const place = locationName ?? (filters.location && capitalizeWords(filters.location));
  const where = place && `en ${place}`;
  return [what, operation, where].filter(Boolean).join(' ');
}

/** "ramos mejía" → "Ramos Mejía": la zona viene como la escribió la persona. */
function capitalizeWords(text: string): string {
  return text.replace(
    /(^|\s)(\p{Ll})/gu,
    (_match, space: string, letter: string) => `${space}${letter.toLocaleUpperCase('es-AR')}`,
  );
}

/**
 * Un listado con filtros finos (precio, ambientes, área del mapa, orden) o en la vista de mapa no
 * se indexa: son infinitas URLs con el mismo contenido. Operación, tipo, zona y página sí.
 */
export function isIndexable(filters: ListingFilters): boolean {
  return (
    filters.minPrice === undefined &&
    filters.maxPrice === undefined &&
    filters.minRooms === undefined &&
    filters.minBedrooms === undefined &&
    filters.area === undefined &&
    filters.view === undefined &&
    filters.sort === 'featured'
  );
}
