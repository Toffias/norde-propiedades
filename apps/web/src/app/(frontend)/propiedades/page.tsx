import { cn } from '@norde/ui/lib/utils';
import { List, Map as MapIcon, X } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Pagination } from '../../../components/blog/pagination';
import { ListingFiltersPanel } from '../../../components/properties/listing-filters-form';
import { ListingGrid } from '../../../components/properties/listing-card';
import { ListingMap } from '../../../components/properties/listing-map';
import { SearchSubscribe } from '../../../components/properties/search-subscribe';
import { SortSelect } from '../../../components/properties/sort-select';
import { Breadcrumbs } from '../../../components/seo/breadcrumbs';
import {
  activeFilters,
  isIndexable,
  LISTING_PAGE_SIZE,
  listingHref,
  listingTitle,
  parseListingFilters,
  SORT_OPTIONS,
  type ListingFilters,
} from '../../../lib/properties/listing-filters';
import {
  findLocations,
  listingMap,
  searchFacets,
  searchListings,
  suggestLocations,
} from '../../../lib/properties/queries';
import { LOCATION_QUERY_MIN_LENGTH } from '../../../lib/properties/queries';
import { buildMetadata, withBrand } from '../../../lib/seo/metadata';
import { listingSubscription } from '../../../lib/subscriptions/listing-subscription';
import { routes } from '../../../lib/seo/routes';

// Por request: los filtros vienen en la URL. Los datos salen del caché de propiedades.
export const dynamic = 'force-dynamic';

/** La URL canónica: lo que se indexa (un tipo y una zona), sin orden ni filtros finos. */
function canonicalOf(filters: ListingFilters): string {
  const [locationId] = filters.locationIds ?? [];
  const [propertyType] = filters.propertyTypes ?? [];
  return listingHref(
    {
      ...(filters.operation && { operation: filters.operation }),
      ...(propertyType && { propertyTypes: [propertyType] }),
      ...(filters.location && { location: filters.location }),
      ...(locationId && { locationIds: [locationId] }),
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
  const locations = await findLocations(filters.locationIds ?? []);
  const title = listingTitle(
    filters,
    locations.map((l) => l.name),
  );
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
  if (filters.location === undefined || filters.locationIds !== undefined) return undefined;
  if (filters.location.trim().length < LOCATION_QUERY_MIN_LENGTH) return undefined;
  const [match] = await suggestLocations(filters.location, filters.operation);
  return match && listingHref(filters, { location: undefined, locationIds: [match.id], page: 1 });
}

const TOGGLE =
  'flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

export default async function PropertiesPage({ searchParams }: PageProps<'/propiedades'>) {
  const filters = parseListingFilters(await searchParams);
  const resolved = await canonicalLocation(filters);
  if (resolved) redirect(resolved);

  const isMap = filters.view === 'map';
  const [result, map, facets, locations] = await Promise.all([
    isMap ? undefined : searchListings(filters, LISTING_PAGE_SIZE),
    isMap ? listingMap(filters) : undefined,
    searchFacets(filters),
    findLocations(filters.locationIds ?? []),
  ]);
  const total = result?.total ?? map?.total ?? 0;
  const locationNames = locations.map((l) => l.name);
  const title = listingTitle(filters, locationNames);
  const subscription = listingSubscription(filters, locationNames);
  const chips = activeFilters(filters, {
    locations: new Map(locations.map((l) => [l.id, l.name])),
    features: new Map(facets.features.map((f) => [f.id, f.name])),
  });
  const clearHref = listingHref({
    ...(filters.operation && { operation: filters.operation }),
    ...(filters.view && { view: filters.view }),
    sort: filters.sort,
    page: 1,
  });
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
        <aside className="lg:self-start">
          <ListingFiltersPanel
            filters={filters}
            facets={facets}
            locations={locations.map((l) => ({ value: l.id, label: l.name }))}
          />
        </aside>

        <section aria-labelledby="results-count">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p id="results-count" className="font-semibold" aria-live="polite">
              {total === 1 ? '1 propiedad' : `${total} propiedades`}
              {isMap && ' en el mapa'}
            </p>
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

          {chips.length > 0 && (
            <ul
              aria-label="Filtros aplicados"
              className="-mt-1 mb-5 flex flex-wrap items-center gap-2"
            >
              {chips.map((chip) => (
                <li key={chip.key}>
                  <Link
                    href={chip.removeHref}
                    scroll={false}
                    aria-label={`Quitar el filtro ${chip.label}`}
                    className="bg-muted hover:bg-muted/70 focus-visible:ring-ring/50 flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold outline-none focus-visible:ring-[3px]"
                  >
                    {chip.label}
                    <X aria-hidden className="size-3.5" />
                  </Link>
                </li>
              ))}
              {chips.length > 1 && (
                <li>
                  <Link
                    href={clearHref}
                    scroll={false}
                    className="text-muted-foreground hover:text-foreground px-1 text-xs font-semibold underline-offset-2 hover:underline"
                  >
                    Limpiar todo
                  </Link>
                </li>
              )}
            </ul>
          )}

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
                {chips.length > 0 && (
                  <Link
                    href={clearHref}
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

          {subscription && <SearchSubscribe {...subscription} empty={total === 0} />}
        </section>
      </div>
    </div>
  );
}
