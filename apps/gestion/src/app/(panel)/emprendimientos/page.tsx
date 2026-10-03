import {
  DEVELOPMENT_LAYOUT_VALUES,
  ListDevelopmentsQuerySchema,
  type DevelopmentLayoutValue,
} from '@norde/core/properties/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { PageHeader } from '@norde/ui/components/page-header';
import { LandmarkIcon } from 'lucide-react';
import type { Metadata } from 'next';

import { getContainer } from '../../../container';
import {
  DevelopmentsView,
  type DevelopmentFilterValues,
} from '../../../features/developments/components/developments-view';
import { DEVELOPMENT_LIST_ERROR_MESSAGES } from '../../../features/developments/messages';
import { messageForError } from '../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../lib/list-params';
import { requireSession } from '../../../lib/session';

export const metadata: Metadata = { title: 'Emprendimientos' };

/** Lista (por defecto) o mapa: `?layout=map`. */
function layoutFrom(params: SearchParams): DevelopmentLayoutValue {
  const value = params.layout;
  return DEVELOPMENT_LAYOUT_VALUES.find((layout) => layout === value) ?? 'list';
}

export default async function DevelopmentsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const params = await searchParams;
  const { value: query, invalidKeys } = parseListParams(ListDevelopmentsQuerySchema, params);
  const layout = query.view === 'trash' ? 'list' : layoutFrom(params);
  // En el mapa los pines los pide la vista según el área: la página de la grilla no hace falta.
  const result =
    layout === 'map'
      ? undefined
      : await getContainer().properties.listDevelopments.execute(query, actor);
  const page = result?.isOk() === true ? result.value : undefined;

  const filters: DevelopmentFilterValues = {
    q: query.q ?? '',
    status: query.status ?? '',
    developmentType: query.developmentType ?? '',
    constructionStatus: query.constructionStatus ?? '',
    view: query.view,
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={LandmarkIcon}
        title="Emprendimientos"
        subtitle="Desarrollos en pozo o en construcción, con sus unidades"
      />

      {invalidKeys.length > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          Algunos filtros de la dirección no eran válidos ({invalidKeys.join(', ')}) y se usaron los
          valores por defecto.
        </p>
      )}

      <Card className="gap-0 overflow-hidden p-0">
        {result?.isErr() === true ? (
          <DataTableError
            message={messageForError(result.error, DEVELOPMENT_LIST_ERROR_MESSAGES)}
          />
        ) : (
          <DevelopmentsView
            layout={layout}
            rows={page?.items ?? []}
            total={page?.total ?? 0}
            page={page?.page ?? 1}
            pageSize={page?.pageSize ?? query.pageSize}
            sort={query.sort}
            filters={filters}
            permissions={{
              create: actor.can('developments:create'),
              delete: actor.can('developments:delete'),
            }}
          />
        )}
      </Card>
    </div>
  );
}
