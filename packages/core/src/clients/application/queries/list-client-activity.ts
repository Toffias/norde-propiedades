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
  ListClientActivityQuerySchema,
  type ClientActivityRow,
  type ListClientActivityQuery,
} from '../../contracts';
import {
  canReadClients,
  invalidInput,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientRecordQuery } from '../ports/client-record-query';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import { findReadableClient, toActivityRows } from '../record-support';

export type ListClientActivityError = ForbiddenError | InvalidInputError | ClientNotFoundError;

/**
 * El timeline de la ficha: notas, consultas, conversaciones del agente de IA, unificaciones y
 * (cuando existan) cambios de estado y envíos. Lo más reciente primero, paginado en la base.
 */
export class ListClientActivity {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly records: ClientRecordQuery;
      readonly agents: ClientAgents;
    },
  ) {}

  async execute(
    input: ListClientActivityQuery,
    actor: Actor,
  ): Promise<Result<Page<ClientActivityRow>, ListClientActivityError>> {
    if (!canReadClients(actor)) return err({ type: 'Forbidden' });

    const parsed = ListClientActivityQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const query = parsed.data;

    const client = await findReadableClient(this.deps.uow, actor, query.clientId);
    if (client.isErr()) return err(client.error);

    const { page, pageSize } = query;
    const slice = await this.deps.records.activity({
      clientId: client.value.id,
      kind: query.kind,
      direction: query.sort.direction,
      ...toOffsetLimit({ page, pageSize }),
    });
    const items = await toActivityRows(slice.items, this.deps);
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
