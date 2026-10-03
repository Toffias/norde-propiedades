import { ListDevelopmentsQuerySchema } from '@norde/core/properties/contracts';
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

export default async function DevelopmentsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const params = await searchParams;
  const { value: query, invalidKeys } = parseListParams(ListDevelopmentsQuerySchema, params);
  const result = await getContainer().properties.listDevelopments.execute(query, actor);

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
        {result.isErr() ? (
          <DataTableError
            message={messageForError(result.error, DEVELOPMENT_LIST_ERROR_MESSAGES)}
          />
        ) : (
          <DevelopmentsView
            rows={result.value.items}
            total={result.value.total}
            page={result.value.page}
            pageSize={result.value.pageSize}
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
