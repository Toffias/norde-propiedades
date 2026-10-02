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
  ListClientOpportunitiesQuerySchema,
  type ClientOpportunityRow,
  type ListClientOpportunitiesQuery,
} from '../../contracts';
import { isOpenStatus } from '../../domain/opportunity-status';
import {
  canReadClients,
  invalidInput,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientRecordQuery } from '../ports/client-record-query';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import { findReadableClient, userNames, userRef } from '../record-support';

export type ListClientOpportunitiesError = ForbiddenError | InvalidInputError | ClientNotFoundError;

/**
 * Todas las oportunidades del contacto (abiertas y cerradas), las más nuevas primero. Cliente y
 * oportunidad son entidades separadas: la ficha las muestra todas.
 */
export class ListClientOpportunities {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly records: ClientRecordQuery;
      readonly agents: ClientAgents;
    },
  ) {}

  async execute(
    input: ListClientOpportunitiesQuery,
    actor: Actor,
  ): Promise<Result<Page<ClientOpportunityRow>, ListClientOpportunitiesError>> {
    if (!canReadClients(actor)) return err({ type: 'Forbidden' });

    const parsed = ListClientOpportunitiesQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const query = parsed.data;

    const client = await findReadableClient(this.deps.uow, actor, query.clientId);
    if (client.isErr()) return err(client.error);

    const { page, pageSize } = query;
    const slice = await this.deps.records.opportunities({
      clientId: client.value.id,
      direction: query.sort.direction,
      ...toOffsetLimit({ page, pageSize }),
    });
    const names = await userNames(
      this.deps.agents,
      slice.items.map((item) => item.agentId),
    );
    const items = slice.items.map(({ agentId, ...item }): ClientOpportunityRow => ({
      ...item,
      open: isOpenStatus(item.status),
      agent: userRef(agentId, names),
    }));
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
