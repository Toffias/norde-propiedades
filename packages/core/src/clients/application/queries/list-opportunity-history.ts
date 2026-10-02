import { canActOn, OWNERSHIP_RULES } from '../../../identity';
import {
  err,
  ok,
  toOffsetLimit,
  toPage,
  type Actor,
  type ForbiddenError,
  type Page,
  type Result,
} from '../../../shared';
import {
  ListOpportunityHistoryQuerySchema,
  type ClientActivityRow,
  type ListOpportunityHistoryQuery,
} from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import {
  canReadOpportunities,
  findOpportunity,
  type OpportunityNotFoundError,
} from '../opportunity-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientRecordQuery } from '../ports/client-record-query';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import { toActivityRows } from '../record-support';

export type ListOpportunityHistoryError =
  ForbiddenError | InvalidInputError | OpportunityNotFoundError;

/**
 * El historial de una oportunidad (el modal del tablero): las notas que se le escribieron, sus
 * cambios de estado y lo demás que quedó atado a ella. Lo más reciente primero, paginado en la base
 * y filtrable por tipo. Lo ve quien ve la oportunidad.
 */
export class ListOpportunityHistory {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly records: ClientRecordQuery;
      readonly agents: ClientAgents;
    },
  ) {}

  async execute(
    input: ListOpportunityHistoryQuery,
    actor: Actor,
  ): Promise<Result<Page<ClientActivityRow>, ListOpportunityHistoryError>> {
    if (!canReadOpportunities(actor)) return err({ type: 'Forbidden' });

    const parsed = ListOpportunityHistoryQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const query = parsed.data;

    const opportunity = await this.deps.uow.run((tx) => findOpportunity(tx, query.opportunityId));
    if (!opportunity) return err({ type: 'OpportunityNotFound' });
    if (!canActOn(actor, OWNERSHIP_RULES.opportunitiesRead, opportunity.ownership)) {
      return err({ type: 'Forbidden' });
    }

    const { page, pageSize } = query;
    const slice = await this.deps.records.opportunityActivity({
      opportunityId: opportunity.id,
      kind: query.kind,
      direction: query.sort.direction,
      ...toOffsetLimit({ page, pageSize }),
    });
    const items = await toActivityRows(slice.items, this.deps);
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
