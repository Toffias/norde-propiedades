import {
  err,
  ok,
  toOffsetLimit,
  toPage,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Page,
  type Result,
} from '../../../shared';
import {
  ListOpportunitiesQuerySchema,
  type ListOpportunitiesQuery,
  type OpportunityPipelineRow,
} from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import {
  canReadOpportunities,
  loadOpportunityCatalog,
  resolveOpportunityFilter,
  toPipelineRows,
} from '../opportunity-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientListings } from '../ports/client-record-query';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import type { OpportunityPipelineQuery } from '../ports/opportunity-pipeline-query';

export type ListOpportunitiesError = ForbiddenError | InvalidInputError;

/**
 * Una sección del pipeline: las oportunidades de un estado que el actor puede ver (las suyas, las
 * de su sucursal o todas, por el agente de la oportunidad), paginadas en el servidor.
 */
export class ListOpportunities {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly pipeline: OpportunityPipelineQuery;
      readonly agents: ClientAgents;
      readonly listings: ClientListings;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ListOpportunitiesQuery,
    actor: Actor,
  ): Promise<Result<Page<OpportunityPipelineRow>, ListOpportunitiesError>> {
    if (!canReadOpportunities(actor)) return err({ type: 'Forbidden' });

    const parsed = ListOpportunitiesQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { page, pageSize, sort, stageId, ...filter } = parsed.data;

    const [slice, catalog] = await Promise.all([
      this.deps.pipeline.search({
        ...resolveOpportunityFilter(filter, actor),
        stageId,
        sort,
        ...toOffsetLimit({ page, pageSize }),
      }),
      loadOpportunityCatalog(this.deps.uow),
    ]);
    const items = await toPipelineRows(slice.items, this.deps, actor, {
      now: this.deps.clock.now(),
      catalog,
    });
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
