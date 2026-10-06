import type { Metadata } from 'next';
import Link from 'next/link';

import { Pagination } from '../../../components/blog/pagination';
import { ListingFiltersPanel } from '../../../components/properties/listing-filters-form';
import { ListingGrid } from '../../../components/properties/listing-card';
import { SortSelect } from '../../../components/properties/sort-select';
import { Breadcrumbs } from '../../../components/seo/breadcrumbs';
import {
  activeFilterCount,
  isIndexable,
  LISTING_PAGE_SIZE,
  listingHref,
  listingTitle,
  parseListingFilters,
  SORT_OPTIONS,
  type ListingFilters,
} from '../../../lib/properties/listing-filters';
import { searchListings } from '../../../lib/properties/queries';
import { buildMetadata, withBrand } from '../../../lib/seo/metadata';
import { routes } from '../../../lib/seo/routes';

// Por request: los filtros vienen en la URL. Los datos salen del caché de propiedades.
export const dynamic = 'force-dynamic';

/** La URL canónica: los filtros que se indexan, sin orden ni filtros finos. */
function canonicalOf(filters: ListingFilters): string {
  return listingHref(
    {
      ...(filters.operation && { operation: filters.operation }),
      ...(filters.propertyType && { propertyType: filters.propertyType }),
      ...(filters.location && { location: filters.location }),
      sort: 'featured',
      page: filters.page,
    },
    { page: filters.page },
  );
}

export async function generateMetadata({
  searchParams,
}: PageProps<'/propiedades'>): Promise<Metadata> {
  const filters = parseListingFilters(await searchParams);
  const title = listingTitle(filters);
  const page = filters.page > 1 ? ` (página ${filters.page})` : '';
  return buildMetadata({
    title: withBrand(`${title}${page}`),
    description: `${title}: fotos, precios y datos de cada propiedad. Consultá directo con Norde Propiedades.`,
    path: canonicalOf(filters),
    noIndex: !isIndexable(filters),
  });
}

export default async function PropertiesPage({ searchParams }: PageProps<'/propiedades'>) {
  const filters = parseListingFilters(await searchParams);
  const result = await searchListings(filters, LISTING_PAGE_SIZE);
  const title = listingTitle(filters);
  const sortOptions = SORT_OPTIONS.map((o) => ({
    label: o.label,
    href: listingHref(filters, { sort: o.value }),
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8">
      <Breadcrumbs
        items={[
          { name: 'Inicio', path: routes.home() },
          { name: 'Propiedades', path: routes.properties() },
        ]}
      />
      <div className="mt-4 space-y-3">
        <h1 className="text-3xl font-extrabold sm:text-4xl">{title}</h1>
        <div aria-hidden className="deco-steps-sm" />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[18rem_1fr]">
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <ListingFiltersPanel filters={filters} />
        </aside>

        <section aria-labelledby="results-count">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p id="results-count" className="font-semibold" aria-live="polite">
              {result.total === 1 ? '1 propiedad' : `${result.total} propiedades`}
            </p>
            {result.total > 1 && (
              <SortSelect
                options={sortOptions}
                selectedHref={listingHref(filters, { sort: filters.sort })}
              />
            )}
          </div>

          {result.items.length > 0 ? (
            <ListingGrid listings={result.items} headingLevel="h2" priorityCount={3} />
          ) : (
            <div className="bg-card rounded-3xl border px-6 py-16 text-center">
              <p className="text-lg font-bold">No encontramos propiedades con esos filtros</p>
              <p className="text-muted-foreground mt-2">
                Probá con otra zona, otro tipo o un rango de precio más amplio.
              </p>
              {activeFilterCount(filters) > 0 && (
                <Link
                  href={routes.properties()}
                  className="bg-primary text-primary-foreground hover:bg-primary-700 mt-6 inline-flex h-11 items-center rounded-xl px-6 text-sm font-bold transition-colors"
                >
                  Ver todas las propiedades
                </Link>
              )}
            </div>
          )}

          <Pagination
            current={result.page}
            total={result.totalPages}
            hrefFor={(page) => listingHref(filters, { page })}
          />
        </section>
      </div>
    </div>
  );
}
