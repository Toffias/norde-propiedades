import 'server-only';

import { unstable_cache } from 'next/cache';

import { getContainer } from '../../container';
import {
  DEVELOPMENTS_CACHE_TAG,
  PROPERTIES_CACHE_TAG,
  PROPERTIES_REVALIDATE_SECONDS,
} from '../properties/cache';
import type { ListingPage } from '../properties/queries';
import { toListingCard } from '../properties/view';
import { toDevelopmentSearchInput, type DevelopmentFilters } from './listing-filters';
import {
  toDevelopmentCard,
  toDevelopmentDetail,
  type DevelopmentCard,
  type DevelopmentDetailView,
} from './view';

// Lecturas de emprendimientos para las páginas, con caché (ADR 0011 y 0023). Devuelven vistas ya
// formateadas. Se invalidan con `developments` (cambió un emprendimiento) y con `properties`
// (cambió una unidad: el conteo, el "desde" y la grilla de unidades dependen de ellas).

const CACHE_OPTIONS = {
  tags: [DEVELOPMENTS_CACHE_TAG, PROPERTIES_CACHE_TAG],
  revalidate: PROPERTIES_REVALIDATE_SECONDS,
};

/** Unidades por página en la ficha. */
export const UNITS_PAGE_SIZE = 12;

export interface DevelopmentListPage {
  readonly items: readonly DevelopmentCard[];
  readonly total: number;
  readonly page: number;
  readonly totalPages: number;
}

async function search(filters: DevelopmentFilters, pageSize: number): Promise<DevelopmentListPage> {
  const result = await getContainer().developments.search(
    toDevelopmentSearchInput(filters, pageSize),
  );
  // Los filtros llegan validados por `parseDevelopmentFilters`: un error acá es un bug.
  if (result.isErr()) throw new Error(`Development search failed: ${result.error.type}`);
  const { items, total, page } = result.value;
  return {
    items: items.map(toDevelopmentCard),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Una página del listado con los filtros de la URL. */
export const searchDevelopments = unstable_cache(search, ['developments:search'], CACHE_OPTIONS);

export type DevelopmentLookup =
  | { readonly kind: 'listed'; readonly development: DevelopmentDetailView }
  /** Existe pero no se ofrece (cargando información o en la papelera). */
  | { readonly kind: 'not_listed' }
  | { readonly kind: 'not_found' };

/** La ficha por su slug. */
export const findDevelopment = unstable_cache(
  async (slug: string): Promise<DevelopmentLookup> => {
    const result = await getContainer().developments.detail({ slug });
    if (result.isOk()) {
      return { kind: 'listed', development: toDevelopmentDetail(result.value) };
    }
    switch (result.error.type) {
      case 'DevelopmentNotListed':
        return { kind: 'not_listed' };
      case 'DevelopmentNotFound':
        return { kind: 'not_found' };
      case 'Forbidden':
        throw new Error('The web actor cannot read developments');
    }
  },
  ['developments:detail'],
  CACHE_OPTIONS,
);

/** Una página de las unidades publicadas de un emprendimiento, de la más barata a la más cara. */
export const developmentUnits = unstable_cache(
  async (developmentId: string, page: number): Promise<ListingPage> => {
    const result = await getContainer().properties.search({
      developmentId,
      sort: 'price_asc',
      page,
      pageSize: UNITS_PAGE_SIZE,
    });
    if (result.isErr()) throw new Error(`Development units search failed: ${result.error.type}`);
    const { items, total } = result.value;
    return {
      items: items.map(toListingCard),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / UNITS_PAGE_SIZE)),
    };
  },
  ['developments:units'],
  CACHE_OPTIONS,
);

/** Tope del sitemap: 20 × 24 = 480 emprendimientos, muy por encima de la cartera. */
const SITEMAP_MAX_PAGES = 20;
const SITEMAP_PAGE_SIZE = 24;

/** Los slugs publicados, para el sitemap. Pagina contra el core: nunca pide una lista sin límite. */
export const developmentSlugs = unstable_cache(
  async (): Promise<readonly string[]> => {
    const slugs: string[] = [];
    for (let page = 1; page <= SITEMAP_MAX_PAGES; page++) {
      const result = await search({ sort: 'newest', page }, SITEMAP_PAGE_SIZE);
      slugs.push(...result.items.map((item) => item.slug));
      if (page >= result.totalPages) break;
    }
    return slugs;
  },
  ['developments:slugs'],
  CACHE_OPTIONS,
);
