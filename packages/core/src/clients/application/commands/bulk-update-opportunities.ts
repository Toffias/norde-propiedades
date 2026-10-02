import {
  auditAction,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import {
  BulkUpdateOpportunitiesInputSchema,
  type BulkUpdateOpportunitiesInput,
  type BulkUpdateOpportunitiesOutput,
} from '../../contracts';
import {
  addBulkBatch,
  checkBulkSize,
  emptyBulkTotals,
  OpportunityBulkOperation,
  runsAsJob,
  type OpportunityBulkSelection,
  type TooManyOpportunitiesError,
} from '../../domain/opportunity-bulk-operation';
import { invalidInput, type InvalidInputError } from '../client-support';
import {
  applyBulkBatch,
  BULK_BATCH_SIZE,
  bulkCriteria,
  canRunBulkAction,
  resolveBulkAction,
  type ResolveBulkActionError,
} from '../opportunity-bulk-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import type { OpportunityPipelineQuery } from '../ports/opportunity-pipeline-query';

export type BulkUpdateOpportunitiesError =
  ForbiddenError | InvalidInputError | ResolveBulkActionError | TooManyOpportunitiesError;

/**
 * Cambiar el estado, cerrar con un motivo o reasignar las oportunidades seleccionadas (las
 * marcadas o todas las que cumplen el filtro del pipeline). Hasta `BULK_SYNC_LIMIT` se hace en el
 * request; más, y hasta `MAX_BULK_OPPORTUNITIES`, queda encolada y la procesa un job con los
 * permisos de quien la pidió. Cada oportunidad se chequea por separado: las que no se pueden cambiar
 * se saltean y se informan.
 */
export class BulkUpdateOpportunities {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly pipeline: OpportunityPipelineQuery;
      readonly agents: ClientAgents;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: BulkUpdateOpportunitiesInput,
    actor: Actor,
  ): Promise<Result<BulkUpdateOpportunitiesOutput, BulkUpdateOpportunitiesError>> {
    const parsed = BulkUpdateOpportunitiesInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { selection, action } = parsed.data;
    if (!canRunBulkAction(actor, action.kind)) return err({ type: 'Forbidden' });

    const resolved = await resolveBulkAction(this.deps, action);
    if (resolved.isErr()) return err(resolved.error);

    const now = this.deps.clock.now();
    const context = { ids: this.deps.ids, now };

    // Las marcadas (como mucho una página): en el request, en un lote.
    if (selection.kind === 'ids') {
      const batch = await this.deps.uow.run((tx) =>
        applyBulkBatch(tx, selection.ids, resolved.value, actor, context),
      );
      return ok({
        mode: 'done',
        result: addBulkBatch(emptyBulkTotals(selection.ids.length), batch),
      });
    }

    const criteria = bulkCriteria(selection.filter, actor);
    const total = await this.deps.pipeline.count(criteria);
    const size = checkBulkSize(total);
    if (size.isErr()) return err(size.error);

    if (runsAsJob(total)) {
      const stored: OpportunityBulkSelection = {
        kind: 'filter',
        filter: storedFilter(selection.filter),
      };
      const operation = OpportunityBulkOperation.request({
        id: nextId<'OpportunityBulkOperation'>(this.deps.ids),
        action,
        selection: stored,
        total,
        requestedBy: actor.id,
        now,
      });
      if (operation.isErr()) return err(operation.error);
      const job = operation.value;
      await this.deps.uow.run(async (tx) => {
        await tx.bulkOperations.save(job, actor.id);
        await tx.events.publish(job.pullEvents());
        await tx.audit.record(
          auditAction(
            actor,
            {
              action: 'opportunity.bulk_requested',
              entityType: 'opportunity_bulk_operation',
              entityId: job.id,
              clientIds: [],
            },
            {
              action: { before: null, after: action.kind },
              total: { before: null, after: total },
            },
          ),
        );
      });
      return ok({ mode: 'queued', operationId: job.id, total });
    }

    // Las del filtro, en el request, por clave (como mucho `BULK_SYNC_LIMIT`).
    let totals = emptyBulkTotals(total);
    let afterId: string | undefined;
    while (totals.processed < total) {
      const ids = await this.deps.pipeline.matchingIds(criteria, {
        afterId,
        limit: Math.min(BULK_BATCH_SIZE, total - totals.processed),
      });
      if (ids.length === 0) break;
      const batch = await this.deps.uow.run((tx) =>
        applyBulkBatch(tx, ids, resolved.value, actor, context),
      );
      totals = addBulkBatch(totals, batch);
      afterId = batch.lastId;
    }
    return ok({ mode: 'done', result: totals });
  }
}

/** El filtro tal como llegó, sin los vacíos: se vuelve a validar cuando corre el job. */
function storedFilter(
  filter: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filter).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}
