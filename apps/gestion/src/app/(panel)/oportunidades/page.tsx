import {
  ListOpportunitiesQuerySchema,
  OpportunityFilterSchema,
} from '@norde/core/clients/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { ErrorState } from '@norde/ui/components/error-state';
import { PageHeader } from '@norde/ui/components/page-header';
import { TargetIcon } from 'lucide-react';
import type { Metadata } from 'next';

import { getContainer } from '../../../container';
import {
  OpportunityFilters,
  type OpportunityFilterValues,
} from '../../../features/opportunities/components/opportunity-filters';
import {
  OpportunityPipeline,
  type OpportunitySection,
} from '../../../features/opportunities/components/opportunity-pipeline';
import { LIST_OPPORTUNITIES_ERROR_MESSAGES } from '../../../features/opportunities/messages';
import { messageForError } from '../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../lib/list-params';
import { requireSession } from '../../../lib/session';

export const metadata: Metadata = { title: 'Oportunidades' };

export default async function OpportunitiesPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const params = await searchParams;
  const { clients } = getContainer();

  const config = await clients.getOpportunityConfiguration.execute(actor);
  if (config.isErr()) {
    return (
      <ErrorState
        title="No podés ver esta sección"
        description={messageForError(config.error, LIST_OPPORTUNITIES_ERROR_MESSAGES)}
      />
    );
  }
  const { stages, closeReasons } = config.value;

  const parsedFilter = parseListParams(OpportunityFilterSchema, params);
  const filter = parsedFilter.value;
  const invalidKeys = new Set(parsedFilter.invalidKeys);
  const counts = await clients.countOpportunitiesByStage.execute(filter, actor);

  // La sección abierta: la de la URL, o el primer estado (por posición) que tiene oportunidades.
  const requested = typeof params.stageId === 'string' ? params.stageId : undefined;
  const known = stages.some((stage) => stage.id === requested);
  const firstWithRows = counts.isOk()
    ? stages.find((stage) => counts.value.some((c) => c.stageId === stage.id && c.count > 0))?.id
    : undefined;
  const stageId = known ? requested : firstWithRows;

  let section: OpportunitySection | undefined;
  let listError: string | undefined;
  if (counts.isOk() && stageId !== undefined) {
    const { value: query, invalidKeys: listInvalid } = parseListParams(
      ListOpportunitiesQuerySchema,
      { ...params, stageId },
    );
    for (const key of listInvalid) invalidKeys.add(key);
    const result = await clients.listOpportunities.execute(query, actor);
    if (result.isErr()) {
      listError = messageForError(result.error, LIST_OPPORTUNITIES_ERROR_MESSAGES);
    } else {
      section = {
        stageId,
        rows: result.value.items,
        total: result.value.total,
        page: result.value.page,
        pageSize: result.value.pageSize,
        sort: query.sort,
      };
    }
  }
  if (requested !== undefined && !known) invalidKeys.add('stageId');

  const filters: OpportunityFilterValues = {
    q: filter.q ?? '',
    agentId: filter.agentId ?? '',
    branchId: filter.branchId ?? '',
    tagId: filter.tagId ?? '',
    originChannel: filter.originChannel ?? '',
    category: filter.category ?? '',
    createdFrom: filter.createdFrom ?? '',
    createdTo: filter.createdTo ?? '',
    updatedFrom: filter.updatedFrom ?? '',
    updatedTo: filter.updatedTo ?? '',
  };
  // El nombre del agente filtrado, para el selector: sale de las filas (son suyas).
  const agentLabel =
    filter.agentId === undefined
      ? undefined
      : section?.rows.find((row) => row.agent?.id === filter.agentId)?.agent?.name;
  const canPickAgents = actor.can('users:read');

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={TargetIcon}
        title="Oportunidades"
        subtitle="El pipeline comercial: cada consulta de un contacto, en el estado en que está"
      />

      {invalidKeys.size > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          Algunos filtros de la dirección no eran válidos ({[...invalidKeys].join(', ')}) y se
          usaron los valores por defecto.
        </p>
      )}

      <Card className="gap-0 overflow-hidden p-0">
        {counts.isErr() ? (
          <DataTableError
            message={messageForError(counts.error, LIST_OPPORTUNITIES_ERROR_MESSAGES)}
          />
        ) : listError !== undefined ? (
          <DataTableError message={listError} />
        ) : (
          <OpportunityPipeline
            stages={stages}
            counts={counts.value}
            section={section}
            catalog={{ stages, closeReasons }}
            canPickAgents={canPickAgents}
            toolbar={
              <OpportunityFilters
                filters={filters}
                permissions={{
                  pickAgents: canPickAgents,
                  pickBranches: actor.can('branches:read'),
                }}
                agentLabel={agentLabel}
              />
            }
          />
        )}
      </Card>
    </div>
  );
}
