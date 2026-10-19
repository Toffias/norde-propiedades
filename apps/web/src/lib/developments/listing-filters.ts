import {
  DEVELOPMENT_TYPES,
  type ConstructionStatusValue,
  type DevelopmentType,
  type PublicDevelopmentSort,
  type SearchPublishedDevelopmentsInput,
} from '@norde/core/properties/contracts';

import type { SearchParamsRecord } from '../properties/listing-filters';
import { routes } from '../seo/routes';
import { CONSTRUCTION_STATUS_LABELS, DEVELOPMENT_TYPE_LABELS } from './labels';

// Los filtros del listado de emprendimientos viven en la URL (`/emprendimientos?obra=en-pozo`): se
// comparten, se indexan y funcionan sin JavaScript. Un valor inválido se ignora, no da error.

/** Tarjetas por página del listado. */
export const DEVELOPMENTS_PAGE_SIZE = 12;

export const DEVELOPMENT_PARAM_NAMES = {
  developmentType: 'tipo',
  constructionStatus: 'obra',
  sort: 'orden',
  page: 'pagina',
} as const;

const TYPE_PARAMS: Readonly<Record<DevelopmentType, string>> = {
  building: 'edificio',
  gated_community: 'barrio-cerrado',
  housing_complex: 'complejo',
  office_building: 'oficinas',
  lots: 'loteo',
  other: 'otro',
};

export const DEVELOPMENT_TYPE_OPTIONS: readonly {
  readonly value: DevelopmentType;
  readonly param: string;
  readonly label: string;
}[] = DEVELOPMENT_TYPES.map((value) => ({
  value,
  param: TYPE_PARAMS[value],
  label: DEVELOPMENT_TYPE_LABELS[value],
}));

export const CONSTRUCTION_STATUS_OPTIONS: readonly {
  readonly value: ConstructionStatusValue;
  readonly param: string;
  readonly label: string;
}[] = [
  { value: 'pre_sale', param: 'en-pozo', label: CONSTRUCTION_STATUS_LABELS.pre_sale },
  {
    value: 'under_construction',
    param: 'en-construccion',
    label: CONSTRUCTION_STATUS_LABELS.under_construction,
  },
  { value: 'finished', param: 'terminado', label: CONSTRUCTION_STATUS_LABELS.finished },
];

export const DEVELOPMENT_SORT_OPTIONS: readonly {
  readonly value: PublicDevelopmentSort;
  readonly param: string;
  readonly label: string;
}[] = [
  { value: 'newest', param: 'recientes', label: 'Más recientes' },
  { value: 'delivery_asc', param: 'entrega', label: 'Próximos a entregarse' },
];

export interface DevelopmentFilters {
  readonly developmentType?: DevelopmentType;
  readonly constructionStatus?: ConstructionStatusValue;
  readonly sort: PublicDevelopmentSort;
  readonly page: number;
}

function single(params: SearchParamsRecord, name: string): string | undefined {
  const value = params[name];
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = first?.trim();
  return trimmed === '' ? undefined : trimmed;
}

function pageOf(value: string | undefined): number {
  if (value === undefined || !/^[1-9]\d{0,3}$/.test(value)) return 1;
  return Math.min(Number(value), 1000);
}

export function parseDevelopmentFilters(params: SearchParamsRecord): DevelopmentFilters {
  const n = DEVELOPMENT_PARAM_NAMES;
  const developmentType = DEVELOPMENT_TYPE_OPTIONS.find(
    (o) => o.param === single(params, n.developmentType),
  )?.value;
  const constructionStatus = CONSTRUCTION_STATUS_OPTIONS.find(
    (o) => o.param === single(params, n.constructionStatus),
  )?.value;
  return {
    ...(developmentType && { developmentType }),
    ...(constructionStatus && { constructionStatus }),
    sort:
      DEVELOPMENT_SORT_OPTIONS.find((o) => o.param === single(params, n.sort))?.value ?? 'newest',
    page: pageOf(single(params, n.page)),
  };
}

export function toDevelopmentSearchInput(
  filters: DevelopmentFilters,
  pageSize: number,
): SearchPublishedDevelopmentsInput {
  return {
    ...(filters.developmentType && { developmentType: filters.developmentType }),
    ...(filters.constructionStatus && { constructionStatus: filters.constructionStatus }),
    sort: filters.sort,
    page: filters.page,
    pageSize,
  };
}

/**
 * El link del listado con estos filtros. Cambiar un filtro vuelve a la página 1; los valores por
 * defecto (más recientes, página 1) no se escriben, así hay una sola URL por búsqueda.
 */
export function developmentsHref(
  filters: DevelopmentFilters,
  changes: Partial<{
    -readonly [K in keyof DevelopmentFilters]: DevelopmentFilters[K] | undefined;
  }> = {},
): string {
  const next = { ...filters, page: 1, ...changes };
  const n = DEVELOPMENT_PARAM_NAMES;
  const query = new URLSearchParams();
  const set = (name: string, value: string | number | undefined) => {
    if (value !== undefined) query.set(name, String(value));
  };
  set(
    n.developmentType,
    DEVELOPMENT_TYPE_OPTIONS.find((o) => o.value === next.developmentType)?.param,
  );
  set(
    n.constructionStatus,
    CONSTRUCTION_STATUS_OPTIONS.find((o) => o.value === next.constructionStatus)?.param,
  );
  if (next.sort !== undefined && next.sort !== 'newest') {
    set(n.sort, DEVELOPMENT_SORT_OPTIONS.find((o) => o.value === next.sort)?.param);
  }
  if (next.page !== undefined && next.page > 1) set(n.page, next.page);
  const search = query.toString();
  return search === '' ? routes.developments() : `${routes.developments()}?${search}`;
}

/** Título del listado: "Emprendimientos en pozo", "Barrio cerrado: emprendimientos". */
export function developmentsTitle(filters: DevelopmentFilters): string {
  const status = filters.constructionStatus
    ? ` ${CONSTRUCTION_STATUS_LABELS[filters.constructionStatus].toLowerCase()}`
    : '';
  const type = filters.developmentType
    ? ` · ${DEVELOPMENT_TYPE_LABELS[filters.developmentType]}`
    : '';
  return `Emprendimientos${status}${type}`;
}

/** El orden no se indexa (mismo contenido, otra URL); tipo, estado de obra y página sí. */
export function isDevelopmentListIndexable(filters: DevelopmentFilters): boolean {
  return filters.sort === 'newest';
}
