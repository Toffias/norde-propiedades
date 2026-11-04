import {
  MAX_PUBLIC_LOCATIONS,
  PUBLIC_COUNT_OPTION_LIMITS,
  PUBLIC_FEATURE_FACET_LIMIT,
  type Currency,
  type GetPublicPropertyMapInput,
  type MapArea,
  type Operation,
  type PropertyType,
  type PublicAge,
  type PublicCountFacet,
  type PublicSort,
  type SearchPropertiesInput,
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
  /** Repetibles: `ambientes=1&ambientes=2`; la última opción es "o más". */
  rooms: 'ambientes',
  bedrooms: 'dormitorios',
  bathrooms: 'banos',
  minArea: 'm2-desde',
  maxArea: 'm2-hasta',
  age: 'antiguedad',
  furnished: 'amoblado',
  parking: 'cochera',
  /** Repetible: IDs de características del catálogo (pileta, SUM, gimnasio…). */
  feature: 'caracteristica',
  sort: 'orden',
  page: 'pagina',
  /** Área del mapa: `sur,oeste,norte,este`. */
  area: 'area',
  view: 'vista',
} as const;

/** `?vista=mapa`; sin el parámetro, la grilla. */
export const MAP_VIEW_PARAM = 'mapa';

/** Valor de los filtros de sí o no (`?amoblado=si`). */
export const YES_PARAM = 'si';

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

export const AGE_OPTIONS: readonly { value: PublicAge; param: string; label: string }[] = [
  { value: 'brand_new', param: 'a-estrenar', label: 'A estrenar' },
  { value: 'up_to_5', param: 'hasta-5', label: 'Hasta 5 años' },
  { value: 'up_to_10', param: 'hasta-10', label: 'Hasta 10 años' },
  { value: 'up_to_20', param: 'hasta-20', label: 'Hasta 20 años' },
  { value: 'over_20', param: 'mas-de-20', label: 'Más de 20 años' },
];

export const COUNT_FACETS: readonly PublicCountFacet[] = ['rooms', 'bedrooms', 'bathrooms'];

const COUNT_NOUNS: Readonly<Record<PublicCountFacet, readonly [string, string]>> = {
  rooms: ['ambiente', 'ambientes'],
  bedrooms: ['dormitorio', 'dormitorios'],
  bathrooms: ['baño', 'baños'],
};

/** "1 ambiente", "2 ambientes", "4 ambientes o más". */
export function countOptionLabel(facet: PublicCountFacet, option: number): string {
  const [one, many] = COUNT_NOUNS[facet];
  const noun = option === 1 ? one : many;
  return option >= PUBLIC_COUNT_OPTION_LIMITS[facet]
    ? `${option} ${noun} o más`
    : `${option} ${noun}`;
}

/** Las opciones de un filtro de cantidad: `[1, 2, 3, 4]` para ambientes. */
export function countOptions(facet: PublicCountFacet): number[] {
  return Array.from({ length: PUBLIC_COUNT_OPTION_LIMITS[facet] }, (_, index) => index + 1);
}

export interface ListingFilters {
  readonly operation?: Operation;
  readonly propertyType?: PropertyType;
  /** Texto libre: solo si no coincidió con ninguna ubicación del catálogo. */
  readonly location?: string;
  /** Ubicaciones del catálogo (alguna de ellas): incluyen sus barrios. */
  readonly locationIds?: readonly string[];
  /** "Buscar en esta zona" del mapa. */
  readonly area?: MapArea;
  readonly currency?: Currency;
  /** En unidades (sin centavos): lo que escribe la persona. */
  readonly minPrice?: number;
  readonly maxPrice?: number;
  /** Opciones elegidas (1, 2, …; la última es "o más"). */
  readonly rooms?: readonly number[];
  readonly bedrooms?: readonly number[];
  readonly bathrooms?: readonly number[];
  /** Superficie en m². */
  readonly minArea?: number;
  readonly maxArea?: number;
  readonly age?: PublicAge;
  readonly furnished?: true;
  readonly parking?: true;
  /** Características del catálogo: tiene que tener todas. */
  readonly featureIds?: readonly string[];
  readonly sort: PublicSort;
  readonly page: number;
  /** Sin valor: la grilla. */
  readonly view?: 'map';
}

/** Cambios a los filtros para armar un link: `undefined` saca el filtro. */
export type ListingFilterChanges = Partial<{
  -readonly [K in keyof ListingFilters]: ListingFilters[K] | undefined;
}>;

export type SearchParamsRecord = Readonly<Record<string, string | string[] | undefined>>;

function all(params: SearchParamsRecord, name: string): string[] {
  const value = params[name];
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return values.map((v) => v.trim()).filter((v) => v !== '');
}

function single(params: SearchParamsRecord, name: string): string | undefined {
  return all(params, name)[0];
}

/** Los valores válidos y distintos de un parámetro repetible, hasta `max`. */
function many<T>(
  params: SearchParamsRecord,
  name: string,
  parse: (value: string) => T | undefined,
  max: number,
): T[] | undefined {
  const parsed = all(params, name).flatMap((raw) => {
    const value = parse(raw);
    return value === undefined ? [] : [value];
  });
  const values = [...new Set(parsed)].slice(0, max);
  return values.length === 0 ? undefined : values;
}

function wholeNumber(value: string | undefined, max: number): number | undefined {
  if (value === undefined) return undefined;
  const digits = value.replace(/[.\s]/g, '');
  if (!/^\d{1,12}$/.test(digits)) return undefined;
  const parsed = Number(digits);
  return parsed > 0 && parsed <= max ? parsed : undefined;
}

const MAX_PRICE = 100_000_000_000;
const MAX_AREA = 1_000_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(value: string): string | undefined {
  return UUID.test(value) ? value.toLowerCase() : undefined;
}

function countOption(facet: PublicCountFacet) {
  return (value: string) => wholeNumber(value, PUBLIC_COUNT_OPTION_LIMITS[facet]);
}

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
  const limits = PUBLIC_COUNT_OPTION_LIMITS;
  const filters: { -readonly [K in keyof ListingFilters]: ListingFilters[K] } = {
    sort: SORT_OPTIONS.find((o) => o.param === single(params, n.sort))?.value ?? 'featured',
    page: wholeNumber(single(params, n.page), 1000) ?? 1,
  };
  const operation = operationFromParam(single(params, n.operation));
  const propertyType = propertyTypeFromParam(single(params, n.propertyType));
  const location = single(params, n.location)?.slice(0, 100);
  const locationIds = many(params, n.locationId, uuid, MAX_PUBLIC_LOCATIONS);
  const area = parseArea(single(params, n.area));
  const currency = CURRENCY_OPTIONS.find((o) => o.param === single(params, n.currency))?.value;
  const minPrice = wholeNumber(single(params, n.minPrice), MAX_PRICE);
  const maxPrice = wholeNumber(single(params, n.maxPrice), MAX_PRICE);
  const rooms = many(params, n.rooms, countOption('rooms'), limits.rooms);
  const bedrooms = many(params, n.bedrooms, countOption('bedrooms'), limits.bedrooms);
  const bathrooms = many(params, n.bathrooms, countOption('bathrooms'), limits.bathrooms);
  const minArea = wholeNumber(single(params, n.minArea), MAX_AREA);
  const maxArea = wholeNumber(single(params, n.maxArea), MAX_AREA);
  const age = AGE_OPTIONS.find((o) => o.param === single(params, n.age))?.value;
  const featureIds = many(params, n.feature, uuid, PUBLIC_FEATURE_FACET_LIMIT);

  if (operation) filters.operation = operation;
  if (propertyType) filters.propertyType = propertyType;
  if (locationIds) filters.locationIds = locationIds;
  // Con ubicaciones del catálogo, el texto sobra: es su nombre.
  else if (location) filters.location = location;
  if (area) filters.area = area;
  if (single(params, n.view) === MAP_VIEW_PARAM) filters.view = 'map';
  if (currency) filters.currency = currency;
  if (minPrice !== undefined) filters.minPrice = minPrice;
  if (maxPrice !== undefined) filters.maxPrice = maxPrice;
  if (rooms) filters.rooms = rooms;
  if (bedrooms) filters.bedrooms = bedrooms;
  if (bathrooms) filters.bathrooms = bathrooms;
  if (minArea !== undefined) filters.minArea = minArea;
  if (maxArea !== undefined) filters.maxArea = maxArea;
  if (age) filters.age = age;
  if (single(params, n.furnished) === YES_PARAM) filters.furnished = true;
  if (single(params, n.parking) === YES_PARAM) filters.parking = true;
  if (featureIds) filters.featureIds = featureIds;
  return filters;
}

/** La moneda del filtro de precio: la elegida o, si no, la habitual de la operación. */
export function priceCurrency(filters: Pick<ListingFilters, 'currency' | 'operation'>): Currency {
  if (filters.currency) return filters.currency;
  return filters.operation === 'rent' || filters.operation === 'temporary_rent' ? 'ARS' : 'USD';
}

function nonEmpty<T>(values: readonly T[] | undefined): T[] | undefined {
  return values === undefined || values.length === 0 ? undefined : [...values];
}

/** Los filtros de la URL como input del mapa: los mismos que la grilla, sin orden ni página. */
export function toMapInput(filters: ListingFilters): GetPublicPropertyMapInput {
  const hasPrice = filters.minPrice !== undefined || filters.maxPrice !== undefined;
  const locationIds = nonEmpty(filters.locationIds);
  const rooms = nonEmpty(filters.rooms);
  const bedrooms = nonEmpty(filters.bedrooms);
  const bathrooms = nonEmpty(filters.bathrooms);
  const featureIds = nonEmpty(filters.featureIds);
  return {
    ...(filters.operation && { operation: filters.operation }),
    ...(filters.propertyType && { propertyType: filters.propertyType }),
    ...(filters.location && { location: filters.location }),
    ...(locationIds && { locationIds }),
    ...(filters.area && { area: filters.area }),
    ...(hasPrice && { currency: priceCurrency(filters) }),
    ...(filters.minPrice !== undefined && { minPriceCents: BigInt(filters.minPrice) * 100n }),
    ...(filters.maxPrice !== undefined && { maxPriceCents: BigInt(filters.maxPrice) * 100n }),
    ...(rooms && { rooms }),
    ...(bedrooms && { bedrooms }),
    ...(bathrooms && { bathrooms }),
    ...(filters.minArea !== undefined && { minSurfaceM2: filters.minArea }),
    ...(filters.maxArea !== undefined && { maxSurfaceM2: filters.maxArea }),
    ...(filters.age && { age: filters.age }),
    ...(filters.furnished && { furnished: true }),
    ...(filters.parking && { withParking: true }),
    ...(featureIds && { featureIds }),
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
export function listingHref(filters: ListingFilters, changes: ListingFilterChanges = {}): string {
  const next = { ...filters, page: 1, ...changes };
  const n = LISTING_PARAM_NAMES;
  const query = new URLSearchParams();
  const set = (name: string, value: string | number | undefined) => {
    if (value !== undefined) query.set(name, String(value));
  };
  const append = (name: string, values: readonly (string | number)[] | undefined) => {
    for (const value of values ?? []) query.append(name, String(value));
  };
  set(n.operation, OPERATION_OPTIONS.find((o) => o.value === next.operation)?.param);
  set(n.propertyType, PROPERTY_TYPE_OPTIONS.find((o) => o.value === next.propertyType)?.param);
  set(n.location, next.location);
  append(n.locationId, next.locationIds);
  // La moneda solo dice algo con un precio: sin precio no se escribe (una URL por búsqueda).
  if (next.minPrice !== undefined || next.maxPrice !== undefined) {
    set(n.currency, CURRENCY_OPTIONS.find((o) => o.value === next.currency)?.param);
  }
  set(n.minPrice, next.minPrice);
  set(n.maxPrice, next.maxPrice);
  append(n.rooms, next.rooms);
  append(n.bedrooms, next.bedrooms);
  append(n.bathrooms, next.bathrooms);
  set(n.minArea, next.minArea);
  set(n.maxArea, next.maxArea);
  set(n.age, AGE_OPTIONS.find((o) => o.value === next.age)?.param);
  if (next.furnished) set(n.furnished, YES_PARAM);
  if (next.parking) set(n.parking, YES_PARAM);
  append(n.feature, next.featureIds);
  if (next.sort !== undefined && next.sort !== 'featured') {
    set(n.sort, SORT_OPTIONS.find((o) => o.value === next.sort)?.param);
  }
  if (next.page !== undefined && next.page > 1) set(n.page, next.page);
  if (next.area !== undefined) set(n.area, formatArea(next.area));
  if (next.view === 'map') set(n.view, MAP_VIEW_PARAM);
  const search = query.toString();
  return search === '' ? routes.properties() : `${routes.properties()}?${search}`;
}

/**
 * Al cambiar de operación (venta ↔ alquiler) la búsqueda arranca de cero: los precios, las zonas y
 * los ambientes de una no sirven para la otra. Solo quedan la vista (grilla o mapa) y el orden.
 */
export function operationHref(filters: ListingFilters, operation: Operation | undefined): string {
  return listingHref({
    ...(operation && { operation }),
    ...(filters.view && { view: filters.view }),
    sort: filters.sort,
    page: 1,
  });
}

/** Un filtro aplicado, con el link que lo saca: los chips de arriba del listado. */
export interface ActiveFilter {
  readonly key: string;
  readonly label: string;
  readonly removeHref: string;
}

/** Nombres de lo que en la URL viaja por ID: ubicaciones y características. */
export interface FilterNames {
  readonly locations: ReadonlyMap<string, string>;
  readonly features: ReadonlyMap<string, string>;
}

const NO_NAMES: FilterNames = { locations: new Map(), features: new Map() };

/** 1500000 → "1.500.000". */
export function formatThousands(amount: number): string {
  return String(Math.trunc(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** "USD 80.000", "$ 500.000". */
function priceLabel(currency: Currency, amount: number): string {
  const symbol = CURRENCY_OPTIONS.find((o) => o.value === currency)?.label ?? currency;
  return `${symbol} ${formatThousands(amount)}`;
}

function rangeLabel(
  from: number | undefined,
  to: number | undefined,
  format: (value: number) => string,
): string {
  if (from !== undefined && to !== undefined) return `${format(from)} a ${format(to)}`;
  if (from !== undefined) return `Desde ${format(from)}`;
  return `Hasta ${format(to ?? 0)}`;
}

function without<T>(values: readonly T[] | undefined, value: T): T[] | undefined {
  return nonEmpty((values ?? []).filter((v) => v !== value));
}

/**
 * Los filtros aplicados, en el orden del panel, cada uno con el link que lo saca. La operación y
 * el orden no van: la operación tiene su propio selector y el orden no achica los resultados.
 */
export function activeFilters(
  filters: ListingFilters,
  names: FilterNames = NO_NAMES,
): ActiveFilter[] {
  const chips: ActiveFilter[] = [];
  const add = (key: string, label: string, changes: ListingFilterChanges) => {
    chips.push({ key, label, removeHref: listingHref(filters, changes) });
  };

  if (filters.propertyType) {
    const label = PROPERTY_TYPE_OPTIONS.find((o) => o.value === filters.propertyType)?.label;
    add('type', label ?? filters.propertyType, { propertyType: undefined });
  }
  for (const id of filters.locationIds ?? []) {
    add(`location-${id}`, names.locations.get(id) ?? 'Ubicación', {
      locationIds: without(filters.locationIds, id),
    });
  }
  if (filters.location) add('zone', filters.location, { location: undefined });
  if (filters.area) add('map-area', 'Zona del mapa', { area: undefined });
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    const currency = priceCurrency(filters);
    add(
      'price',
      rangeLabel(filters.minPrice, filters.maxPrice, (v) => priceLabel(currency, v)),
      { minPrice: undefined, maxPrice: undefined, currency: undefined },
    );
  }
  for (const facet of COUNT_FACETS) {
    for (const option of filters[facet] ?? []) {
      add(`${facet}-${option}`, countOptionLabel(facet, option), {
        [facet]: without(filters[facet], option),
      });
    }
  }
  if (filters.minArea !== undefined || filters.maxArea !== undefined) {
    add(
      'surface',
      rangeLabel(filters.minArea, filters.maxArea, (v) => `${formatThousands(v)} m²`),
      { minArea: undefined, maxArea: undefined },
    );
  }
  if (filters.age) {
    add('age', AGE_OPTIONS.find((o) => o.value === filters.age)?.label ?? filters.age, {
      age: undefined,
    });
  }
  if (filters.furnished) add('furnished', 'Amoblado', { furnished: undefined });
  if (filters.parking) add('parking', 'Con cochera', { parking: undefined });
  for (const id of filters.featureIds ?? []) {
    add(`feature-${id}`, names.features.get(id) ?? 'Característica', {
      featureIds: without(filters.featureIds, id),
    });
  }
  return chips;
}

/** Cuántos filtros eligió la persona (sin contar orden ni página): para el botón "Filtros (3)". */
export function activeFilterCount(filters: ListingFilters): number {
  return (filters.operation ? 1 : 0) + activeFilters(filters).length;
}

/**
 * Título del listado según los filtros: "Departamentos en venta en Mataderos y Liniers".
 * `locationNames`: los nombres de las ubicaciones del catálogo elegidas.
 */
export function listingTitle(
  filters: ListingFilters,
  locationNames: readonly string[] = [],
): string {
  const what = filters.propertyType ? PROPERTY_TYPE_PLURALS[filters.propertyType] : 'Propiedades';
  const operation = filters.operation
    ? OPERATION_PHRASES[filters.operation]
    : 'en venta y alquiler';
  const place = joinNames(locationNames) ?? (filters.location && capitalizeWords(filters.location));
  const where = place && `en ${place}`;
  return [what, operation, where].filter(Boolean).join(' ');
}

/** "Mataderos", "Mataderos y Liniers", "Mataderos, Liniers y Floresta". */
function joinNames(names: readonly string[]): string | undefined {
  if (names.length <= 1) return names[0];
  return `${names.slice(0, -1).join(', ')} y ${names.at(-1) ?? ''}`;
}

/** "ramos mejía" → "Ramos Mejía": la zona viene como la escribió la persona. */
function capitalizeWords(text: string): string {
  return text.replace(
    /(^|\s)(\p{Ll})/gu,
    (_match, space: string, letter: string) => `${space}${letter.toLocaleUpperCase('es-AR')}`,
  );
}

/**
 * Un listado con filtros finos (precio, ambientes, características, área del mapa, orden, más de
 * una ubicación) o en la vista de mapa no se indexa: son infinitas URLs con el mismo contenido.
 * Operación, tipo, una zona y página sí.
 */
export function isIndexable(filters: ListingFilters): boolean {
  const fine = activeFilters(filters).filter(
    (chip) => chip.key !== 'type' && chip.key !== 'zone' && !chip.key.startsWith('location-'),
  );
  return (
    fine.length === 0 &&
    (filters.locationIds?.length ?? 0) <= 1 &&
    filters.view === undefined &&
    filters.sort === 'featured'
  );
}
