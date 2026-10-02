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
  OpportunityBoard,
  type OpportunityBoardColumn,
} from '../../../features/opportunities/components/opportunity-board';
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

/** Lo que trae cada columna del tablero de una vez (la siguiente página, al hacer scroll). */
const BOARD_PAGE_SIZE = 20;

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
  const board = params.vista === 'tablero';
  if (params.vista !== undefined && !board) invalidKeys.add('vista');

  // La sección abierta: la de la URL, o el primer estado (por posición) que tiene oportunidades.
  const requested = typeof params.stageId === 'string' ? params.stageId : undefined;
  const known = stages.some((stage) => stage.id === requested);
  const firstWithRows = counts.isOk()
    ? stages.find((stage) => counts.value.some((c) => c.stageId === stage.id && c.count > 0))?.id
    : undefined;
  const stageId = known ? requested : firstWithRows;

  let section: OpportunitySection | undefined;
  let listError: string | undefined;
  let columns: OpportunityBoardColumn[] = [];
  const boardSort = parseListParams(ListOpportunitiesQuerySchema, {
    ...params,
    stageId: stages[0]?.id,
  });
  if (board && counts.isOk()) {
    for (const key of boardSort.invalidKeys)
      if (key !== 'page' && key !== 'pageSize') invalidKeys.add(key);
    // Los activos siempre; los desactivados, solo si todavía tienen oportunidades.
    const countOf = new Map(counts.value.map((item) => [item.stageId, item.count]));
    const shown = stages.filter((stage) => stage.isActive || (countOf.get(stage.id) ?? 0) > 0);
    // Cada columna es su propia consulta (con su propia conexión): van en paralelo.
    columns = await Promise.all(
      shown.map(async (stage): Promise<OpportunityBoardColumn> => {
        const result = await clients.listOpportunities.execute(
          {
            ...filter,
            stageId: stage.id,
            sort: boardSort.value.sort,
            page: 1,
            pageSize: BOARD_PAGE_SIZE,
          },
          actor,
        );
        return result.isErr()
          ? {
              stage,
              total: countOf.get(stage.id) ?? 0,
              rows: [],
              error: messageForError(result.error, LIST_OPPORTUNITIES_ERROR_MESSAGES),
            }
          : { stage, total: result.value.total, rows: result.value.items, error: undefined };
      }),
    );
  } else if (counts.isOk() && stageId !== undefined) {
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
  if (!board && requested !== undefined && !known) invalidKeys.add('stageId');

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
      : [...(section?.rows ?? []), ...columns.flatMap((column) => column.rows)].find(
          (row) => row.agent?.id === filter.agentId,
        )?.agent?.name;
  const canPickAgents = actor.can('users:read');
  // Qué acciones masivas ofrecer: el caso de uso vuelve a chequear cada oportunidad.
  const bulkPermissions = {
    update: actor.can('opportunities:update') || actor.can('opportunities:update-others'),
    reassign: actor.can('opportunities:reassign') && canPickAgents,
  };
  const bulk =
    bulkPermissions.update || bulkPermissions.reassign
      ? { filter, permissions: bulkPermissions }
      : undefined;
  const toolbar = (
    <OpportunityFilters
      filters={filters}
      permissions={{ pickAgents: canPickAgents, pickBranches: actor.can('branches:read') }}
      agentLabel={agentLabel}
    />
  );

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
        ) : board ? (
          <OpportunityBoard
            columns={columns}
            query={{ ...filter, sort: boardSort.value.sort, pageSize: BOARD_PAGE_SIZE }}
            catalog={{ stages, closeReasons }}
            canPickAgents={canPickAgents}
            toolbar={toolbar}
          />
        ) : (
          <OpportunityPipeline
            view={filter.category === 'referred_to_partner' ? 'referred' : 'list'}
            bulk={bulk}
            stages={stages}
            counts={counts.value}
            section={section}
            catalog={{ stages, closeReasons }}
            canPickAgents={canPickAgents}
            toolbar={toolbar}
          />
        )}
      </Card>
    </div>
  );
}
