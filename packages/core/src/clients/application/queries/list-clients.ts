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
import { ListClientsQuerySchema, type ClientListRow, type ListClientsQuery } from '../../contracts';
import {
  canReadClients,
  invalidInput,
  resolveClientFilter,
  toClientRows,
  type InvalidInputError,
} from '../client-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientListQuery } from '../ports/client-list-query';

export type ListClientsError = ForbiddenError | InvalidInputError;

/**
 * La grilla de contactos, paginada en el servidor: los suyos, los de su sucursal o todos según los
 * permisos del actor. La papelera (`view: 'trash'`) la ve solo quien puede borrar.
 */
export class ListClients {
  constructor(
    private readonly deps: { readonly list: ClientListQuery; readonly agents: ClientAgents },
  ) {}

  async execute(
    input: ListClientsQuery,
    actor: Actor,
  ): Promise<Result<Page<ClientListRow>, ListClientsError>> {
    if (!canReadClients(actor)) return err({ type: 'Forbidden' });

    const parsed = ListClientsQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const query = parsed.data;
    const criteria = resolveClientFilter(query, actor);
    if (criteria.isErr()) return err(criteria.error);

    const { page, pageSize } = query;
    const slice = await this.deps.list.search({
      ...criteria.value,
      sort: query.sort,
      ...toOffsetLimit({ page, pageSize }),
    });
    const items = await toClientRows(slice.items, this.deps.agents, actor);
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
