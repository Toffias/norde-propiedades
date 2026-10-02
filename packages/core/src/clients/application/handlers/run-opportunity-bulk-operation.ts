import {
  err,
  ok,
  parseId,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { OpportunityBulkActionSchema, OpportunityBulkFilterSchema } from '../../contracts';
import type {
  OpportunityBulkOperation,
  OpportunityBulkStatus,
} from '../../domain/opportunity-bulk-operation';
import {
  applyBulkBatch,
  BULK_BATCH_SIZE,
  bulkCriteria,
  canRunBulkAction,
  resolveBulkAction,
} from '../opportunity-bulk-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import type { OpportunityPipelineQuery } from '../ports/opportunity-pipeline-query';
import type { OpportunityRequesters } from '../ports/opportunity-requesters';

export type RunOpportunityBulkOperationError =
  ForbiddenError | { readonly type: 'InvalidInput' } | { readonly type: 'BulkOperationNotFound' };

/**
 * Procesa una acción masiva encolada (`clients.opportunity_bulk_requested`), por lotes y con los
 * permisos de ahora de quien la pidió: la visibilidad y lo que puede cambiar salen de él. Cada lote
 * guarda su avance en la misma transacción que los cambios: si el job se corta, retoma desde ahí.
 */
export class RunOpportunityBulkOperation {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly pipeline: OpportunityPipelineQuery;
      readonly agents: ClientAgents;
      readonly requesters: OpportunityRequesters;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: { readonly operationId: string },
    actor: Actor,
  ): Promise<Result<{ readonly status: OpportunityBulkStatus }, RunOpportunityBulkOperationError>> {
    // Solo el job: un usuario con `opportunities:*` no la corre desde el panel.
    if (actor.kind !== 'system' || !actor.can('opportunities:run-bulk')) {
      return err({ type: 'Forbidden' });
    }
    const id = parseId<'OpportunityBulkOperation'>(input.operationId);
    if (id.isErr()) return err({ type: 'InvalidInput' });

    const operation = await this.deps.uow.run((tx) => tx.bulkOperations.findById(id.value));
    if (!operation) return err({ type: 'BulkOperationNotFound' });
    if (operation.isFinished) return ok({ status: operation.status });

    const requester = await this.deps.requesters.actorFor(operation.requestedBy);
    if (!requester) return this.fail(operation, 'requester_unavailable', actor);
    const runner = requester.withCorrelation(operation.id);

    const action = OpportunityBulkActionSchema.safeParse(operation.action);
    const filter =
      operation.selection.kind === 'filter'
        ? OpportunityBulkFilterSchema.safeParse(operation.selection.filter)
        : undefined;
    if (!action.success || !filter?.success) return this.fail(operation, 'invalid_request', actor);
    if (!canRunBulkAction(runner, action.data.kind)) {
      return this.fail(operation, 'requester_unavailable', actor);
    }
    const resolved = await resolveBulkAction(this.deps, action.data);
    if (resolved.isErr()) return this.fail(operation, 'invalid_request', actor);
    const criteria = bulkCriteria(filter.data, runner);

    await this.deps.uow.run(async (tx) => {
      operation.start(this.deps.clock.now());
      await tx.bulkOperations.save(operation, actor.id);
    });

    while (operation.remaining > 0) {
      const ids = await this.deps.pipeline.matchingIds(criteria, {
        afterId: operation.cursor,
        limit: Math.min(BULK_BATCH_SIZE, operation.remaining),
      });
      if (ids.length === 0) break;
      await this.deps.uow.run(async (tx) => {
        const now = this.deps.clock.now();
        const batch = await applyBulkBatch(tx, ids, resolved.value, runner, {
          ids: this.deps.ids,
          now,
        });
        operation.recordBatch(batch, now);
        await tx.bulkOperations.save(operation, actor.id);
      });
    }

    await this.deps.uow.run(async (tx) => {
      operation.finish(this.deps.clock.now());
      await tx.bulkOperations.save(operation, actor.id);
    });
    return ok({ status: operation.status });
  }

  private async fail(
    operation: OpportunityBulkOperation,
    failure: 'requester_unavailable' | 'invalid_request',
    actor: Actor,
  ): Promise<Result<{ readonly status: OpportunityBulkStatus }, never>> {
    await this.deps.uow.run(async (tx) => {
      operation.fail(failure, this.deps.clock.now());
      await tx.bulkOperations.save(operation, actor.id);
    });
    return ok({ status: operation.status });
  }
}
