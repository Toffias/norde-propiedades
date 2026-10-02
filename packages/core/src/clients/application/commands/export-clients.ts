import {
  auditAction,
  err,
  ok,
  toAuditValue,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import {
  ExportClientsInputSchema,
  MAX_CLIENT_EXPORT_ROWS,
  type ClientListRow,
  type ExportClientsInput,
} from '../../contracts';
import {
  canReadClients,
  invalidInput,
  resolveClientFilter,
  toClientRows,
  type InvalidInputError,
} from '../client-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientExportFile, ClientExportWriter } from '../ports/client-export-writer';
import type { ClientFilterCriteria, ClientListQuery } from '../ports/client-list-query';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type ExportClientsError =
  | ForbiddenError
  | InvalidInputError
  | { readonly type: 'NothingToExport' }
  | { readonly type: 'TooManyToExport'; readonly max: number; readonly total: number };

/** Filas por consulta: la planilla se arma de a lotes, sin cargar todo en memoria. */
const BATCH_SIZE = 500;

/**
 * Exporta a Excel los contactos que cumplen los filtros, entre los que el actor puede ver. Pide
 * `clients:export` y queda en la auditoría con los filtros y la cantidad. Los propietarios salen
 * enmascarados para quien no puede ver sus datos, igual que en la grilla.
 */
export class ExportClients {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly list: ClientListQuery;
      readonly agents: ClientAgents;
      readonly writer: ClientExportWriter;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ExportClientsInput,
    actor: Actor,
  ): Promise<Result<ClientExportFile, ExportClientsError>> {
    if (!actor.can('clients:export') || !canReadClients(actor)) return err({ type: 'Forbidden' });

    const parsed = ExportClientsInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const criteria = resolveClientFilter(parsed.data.filter, actor);
    if (criteria.isErr()) return err(criteria.error);

    const total = await this.deps.list.count(criteria.value);
    if (total === 0) return err({ type: 'NothingToExport' });
    if (total > MAX_CLIENT_EXPORT_ROWS) {
      return err({ type: 'TooManyToExport', max: MAX_CLIENT_EXPORT_ROWS, total });
    }

    const now = this.deps.clock.now();
    await this.deps.uow.run((tx) =>
      tx.audit.record(
        auditAction(
          actor,
          {
            action: 'client.exported',
            entityType: 'client_export',
            entityId: 'xlsx',
            clientIds: [],
          },
          {
            count: { before: null, after: total },
            filter: { before: null, after: toAuditValue(parsed.data.filter) },
          },
        ),
      ),
    );

    return ok(
      this.deps.writer.write(this.batches(criteria.value, total, actor), { generatedAt: now }),
    );
  }

  private async *batches(
    criteria: ClientFilterCriteria,
    total: number,
    actor: Actor,
  ): AsyncIterable<readonly ClientListRow[]> {
    for (let offset = 0; offset < total; offset += BATCH_SIZE) {
      const slice = await this.deps.list.search({
        ...criteria,
        sort: { field: 'createdAt', direction: 'asc' },
        offset,
        limit: Math.min(BATCH_SIZE, total - offset),
      });
      if (slice.items.length === 0) return;
      yield await toClientRows(slice.items, this.deps.agents, actor);
    }
  }
}
