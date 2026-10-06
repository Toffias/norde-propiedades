import 'server-only';

import type { Operation, PropertyType } from '@norde/core/properties/contracts';
import { unstable_cache } from 'next/cache';

import { getContainer } from '../../container';
import { PROPERTIES_CACHE_TAG, PROPERTIES_REVALIDATE_SECONDS } from './cache';
import { toSearchInput, type ListingFilters } from './listing-filters';
import { toListingCard, toListingDetail, type ListingCard, type ListingDetail } from './view';

// Lecturas de propiedades para las páginas, con caché (ADR 0011 y 0023). Devuelven vistas ya
// formateadas: el caché de Next guarda JSON y los DTO del core traen `bigint` y `Date`.
// Cualquier cambio de una propiedad invalida `properties` (lo avisa apps/gestion).

const CACHE_OPTIONS = { tags: [PROPERTIES_CACHE_TAG], revalidate: PROPERTIES_REVALIDATE_SECONDS };

export interface ListingPage {
  readonly items: readonly ListingCard[];
  readonly total: number;
  readonly page: number;
  readonly totalPages: number;
}

async function search(filters: ListingFilters, pageSize: number): Promise<ListingPage> {
  const result = await getContainer().properties.search(toSearchInput(filters, pageSize));
  // Los filtros llegan validados por `parseListingFilters`: un error acá es un bug.
  if (result.isErr()) throw new Error(`Public search failed: ${result.error.type}`);
  const { items, total, page } = result.value;
  return {
    items: items.map(toListingCard),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Una página del listado con los filtros de la URL. */
export const searchListings = unstable_cache(search, ['properties:search'], CACHE_OPTIONS);

/** Las destacadas de la home: primero las marcadas, después las más nuevas. */
export const featuredListings = unstable_cache(
  async (count: number): Promise<readonly ListingCard[]> =>
    (await search({ sort: 'featured', page: 1 }, count)).items,
  ['properties:featured'],
  CACHE_OPTIONS,
);

export type ListingLookup =
  | { readonly kind: 'listed'; readonly listing: ListingDetail }
  /** Existe pero ya no se ofrece (vendida, reservada, despublicada): la página responde 410. */
  | { readonly kind: 'not_listed' }
  | { readonly kind: 'not_found' };

/** La ficha por su slug. */
export const findListing = unstable_cache(
  async (slug: string): Promise<ListingLookup> => {
    const result = await getContainer().properties.detail({ slug });
    if (result.isOk()) return { kind: 'listed', listing: toListingDetail(result.value) };
    switch (result.error.type) {
      case 'PropertyNotListed':
        return { kind: 'not_listed' };
      case 'PropertyNotFound':
        return { kind: 'not_found' };
      case 'Forbidden':
        throw new Error('The web actor cannot read properties');
    }
  },
  ['properties:detail'],
  CACHE_OPTIONS,
);

/**
 * Propiedades parecidas a una ficha: misma operación y tipo. Si no alcanzan, de la misma
 * operación. Nunca la propia.
 */
export const similarListings = unstable_cache(
  async (
    propertyId: string,
    operation: Operation,
    propertyType: PropertyType,
    count: number,
  ): Promise<readonly ListingCard[]> => {
    const run = async (withType: boolean) => {
      const result = await getContainer().properties.search({
        operation,
        ...(withType && { propertyType }),
        excludePropertyId: propertyId,
        sort: 'featured',
        pageSize: count,
      });
      if (result.isErr()) throw new Error(`Similar search failed: ${result.error.type}`);
      return result.value.items.map(toListingCard);
    };
    const sameType = await run(true);
    return sameType.length >= count
      ? sameType
      : [...sameType, ...(await run(false))]
          .filter((card, index, all) => all.findIndex((c) => c.id === card.id) === index)
          .slice(0, count);
  },
  ['properties:similar'],
  CACHE_OPTIONS,
);

/** Tope de páginas del sitemap: 50 × 24 = 1.200 propiedades, muy por encima de la cartera. */
const SITEMAP_MAX_PAGES = 50;
const SITEMAP_PAGE_SIZE = 24;

/** Los slugs publicados, para el sitemap. Pagina contra el core: nunca pide una lista sin límite. */
export const listingSlugs = unstable_cache(
  async (): Promise<readonly string[]> => {
    const slugs: string[] = [];
    for (let page = 1; page <= SITEMAP_MAX_PAGES; page++) {
      const result = await search({ sort: 'newest', page }, SITEMAP_PAGE_SIZE);
      slugs.push(...result.items.map((item) => item.slug));
      if (page >= result.totalPages) break;
    }
    return slugs;
  },
  ['properties:slugs'],
  CACHE_OPTIONS,
);
