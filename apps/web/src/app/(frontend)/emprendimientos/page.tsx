import type { Metadata } from 'next';
import Link from 'next/link';

import { Pagination } from '../../../components/blog/pagination';
import { DevelopmentGrid } from '../../../components/developments/development-card';
import { DevelopmentFilterChips } from '../../../components/developments/development-filters';
import { SortSelect } from '../../../components/properties/sort-select';
import { Breadcrumbs } from '../../../components/seo/breadcrumbs';
import {
  DEVELOPMENT_SORT_OPTIONS,
  DEVELOPMENTS_PAGE_SIZE,
  developmentsHref,
  developmentsTitle,
  isDevelopmentListIndexable,
  parseDevelopmentFilters,
  type DevelopmentFilters,
} from '../../../lib/developments/listing-filters';
import { searchDevelopments } from '../../../lib/developments/queries';
import { buildMetadata, withBrand } from '../../../lib/seo/metadata';
import { routes } from '../../../lib/seo/routes';

// Por request: los filtros vienen en la URL. Los datos salen del caché de emprendimientos.
export const dynamic = 'force-dynamic';

/** La URL canónica: los filtros que se indexan, sin el orden. */
function canonicalOf(filters: DevelopmentFilters): string {
  return developmentsHref({ ...filters, sort: 'newest' }, { page: filters.page });
}

export async function generateMetadata({
  searchParams,
}: PageProps<'/emprendimientos'>): Promise<Metadata> {
  const filters = parseDevelopmentFilters(await searchParams);
  const title = developmentsTitle(filters);
  const page = filters.page > 1 ? ` (página ${filters.page})` : '';
  return buildMetadata({
    title: withBrand(`${title}${page}`),
    description:
      'Emprendimientos en pozo, en construcción y terminados: unidades disponibles, precios y fecha de entrega. Consultá directo con Norde Propiedades.',
    path: canonicalOf(filters),
    noIndex: !isDevelopmentListIndexable(filters),
  });
}

export default async function DevelopmentsPage({ searchParams }: PageProps<'/emprendimientos'>) {
  const filters = parseDevelopmentFilters(await searchParams);
  const result = await searchDevelopments(filters, DEVELOPMENTS_PAGE_SIZE);
  const filtered =
    filters.developmentType !== undefined || filters.constructionStatus !== undefined;
  const sortOptions = DEVELOPMENT_SORT_OPTIONS.map((o) => ({
    label: o.label,
    href: developmentsHref(filters, { sort: o.value }),
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8">
      <Breadcrumbs
        items={[
          { name: 'Inicio', path: routes.home() },
          { name: 'Emprendimientos', path: routes.developments() },
        ]}
      />
      <div className="mt-4 space-y-3">
        <h1 className="text-3xl font-extrabold sm:text-4xl">{developmentsTitle(filters)}</h1>
        <div aria-hidden className="deco-steps-sm" />
        <p className="text-muted-foreground max-w-2xl">
          Proyectos que comercializamos, desde el pozo hasta la entrega. Mirá las unidades
          disponibles de cada uno y consultanos por financiación.
        </p>
      </div>

      <div className="mt-6">
        <DevelopmentFilterChips filters={filters} />
      </div>

      <section aria-labelledby="results-count" className="mt-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p id="results-count" className="font-semibold" aria-live="polite">
            {result.total === 1 ? '1 emprendimiento' : `${result.total} emprendimientos`}
          </p>
          {result.total > 1 && (
            <SortSelect
              options={sortOptions}
              selectedHref={developmentsHref(filters, { sort: filters.sort })}
            />
          )}
        </div>

        {result.items.length > 0 ? (
          <DevelopmentGrid developments={result.items} headingLevel="h2" priorityCount={3} />
        ) : (
          <div className="bg-card rounded-3xl border px-6 py-16 text-center">
            <p className="text-lg font-bold">
              {filtered
                ? 'No encontramos emprendimientos con esos filtros'
                : 'Pronto vas a ver acá nuestros emprendimientos'}
            </p>
            <p className="text-muted-foreground mt-2">
              Mientras tanto, mirá las propiedades disponibles o escribinos.
            </p>
            <Link
              href={filtered ? routes.developments() : routes.properties()}
              className="bg-primary text-primary-foreground hover:bg-primary-700 mt-6 inline-flex h-11 items-center rounded-xl px-6 text-sm font-bold transition-colors"
            >
              {filtered ? 'Ver todos los emprendimientos' : 'Ver propiedades'}
            </Link>
          </div>
        )}

        <Pagination
          current={result.page}
          total={result.totalPages}
          hrefFor={(page) => developmentsHref(filters, { page })}
        />
      </section>
    </div>
  );
}
