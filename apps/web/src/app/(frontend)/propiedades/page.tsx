import { cn } from '@norde/ui/lib/utils';
import { List, Map as MapIcon, X } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Pagination } from '../../../components/blog/pagination';
import { ListingFiltersPanel } from '../../../components/properties/listing-filters-form';
import { ListingGrid } from '../../../components/properties/listing-card';
import { ListingMap } from '../../../components/properties/listing-map';
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
import {
  findLocation,
  listingMap,
  searchListings,
  suggestLocations,
} from '../../../lib/properties/queries';
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
      ...(filters.locationId && { locationId: filters.locationId }),
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
  const location = filters.locationId ? await findLocation(filters.locationId) : undefined;
  const title = listingTitle(filters, location?.name);
  const page = filters.page > 1 ? ` (página ${filters.page})` : '';
  return buildMetadata({
    title: withBrand(`${title}${page}`),
    description: `${title}: fotos, precios y datos de cada propiedad. Consultá directo con Norde Propiedades.`,
    path: canonicalOf(filters),
    noIndex: !isIndexable(filters),
  });
}

/**
 * Lo que se escribió sin elegir una sugerencia (o un link viejo con `?zona=`): si coincide con una
 * ubicación del catálogo, la URL pasa a usarla. Así "ramos mejia" y "Ramos Mejía" son la misma
 * búsqueda. Si no coincide con ninguna, queda como texto libre.
 */
async function canonicalLocation(filters: ListingFilters): Promise<string | undefined> {
  if (filters.location === undefined || filters.locationId !== undefined) return undefined;
  const [match] = await suggestLocations(filters.location);
  return match && listingHref(filters, { location: undefined, locationId: match.id, page: 1 });
}

const TOGGLE =
  'flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

export default async function PropertiesPage({ searchParams }: PageProps<'/propiedades'>) {
  const filters = parseListingFilters(await searchParams);
  const resolved = await canonicalLocation(filters);
  if (resolved) redirect(resolved);

  const location = filters.locationId ? await findLocation(filters.locationId) : undefined;
  const isMap = filters.view === 'map';
  const [result, map] = await Promise.all([
    isMap ? undefined : searchListings(filters, LISTING_PAGE_SIZE),
    isMap ? listingMap(filters) : undefined,
  ]);
  const total = result?.total ?? map?.total ?? 0;
  const title = listingTitle(filters, location?.name);
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
          <ListingFiltersPanel
            filters={filters}
            location={location && { id: location.id, name: location.name }}
          />
        </aside>

        <section aria-labelledby="results-count">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <p id="results-count" className="font-semibold" aria-live="polite">
                {total === 1 ? '1 propiedad' : `${total} propiedades`}
                {isMap && ' en el mapa'}
              </p>
              {filters.area && (
                <Link
                  href={listingHref(filters, { area: undefined })}
                  className="bg-muted hover:bg-muted/70 flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold"
                >
                  Zona del mapa
                  <X aria-label="Quitar" className="size-3.5" />
                </Link>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {!isMap && total > 1 && (
                <SortSelect
                  options={sortOptions}
                  selectedHref={listingHref(filters, { sort: filters.sort })}
                />
              )}
              <nav aria-label="Vista" className="flex gap-1 rounded-xl border p-1">
                <Link
                  href={listingHref(filters, { view: undefined })}
                  aria-current={isMap ? undefined : 'page'}
                  className={cn(
                    TOGGLE,
                    isMap ? 'hover:bg-muted' : 'bg-primary text-primary-foreground',
                  )}
                >
                  <List aria-hidden className="size-4" />
                  Lista
                </Link>
                <Link
                  href={listingHref(filters, { view: 'map' })}
                  aria-current={isMap ? 'page' : undefined}
                  className={cn(
                    TOGGLE,
                    isMap ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                >
                  <MapIcon aria-hidden className="size-4" />
                  Mapa
                </Link>
              </nav>
            </div>
          </div>

          {map && <ListingMap pins={map.pins} truncated={map.truncated} filters={filters} />}

          {result &&
            (result.items.length > 0 ? (
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
            ))}

          {result && (
            <Pagination
              current={result.page}
              total={result.totalPages}
              hrefFor={(page) => listingHref(filters, { page })}
            />
          )}
        </section>
      </div>
    </div>
  );
}
