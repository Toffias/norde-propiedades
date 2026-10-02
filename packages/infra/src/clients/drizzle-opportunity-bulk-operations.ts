import {
  OpportunityBulkOperation,
  type OpportunityBulkOperationId,
  type OpportunityBulkOperationRepository,
  type OpportunityBulkOperationSnapshot,
} from '@norde/core/clients';
import { parseId } from '@norde/core/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { fromJsonb, toJsonb } from '../db/json';
import { opportunityBulkOperations } from '../db/schema';

// Las columnas `jsonb` y `text` se validan al leer: una fila que no valida está corrupta.

const ActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('change_stage'), stageId: z.string() }),
  z.object({ kind: z.literal('close'), closeReasonId: z.string() }),
  z.object({ kind: z.literal('reassign'), agentId: z.string().nullable() }),
]);

const SelectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ids'), ids: z.array(z.string()) }),
  z.object({ kind: z.literal('filter'), filter: z.record(z.string(), z.string()) }),
]);

const count = z.int().min(0);
const TotalsSchema = z.object({
  total: count,
  processed: count,
  updated: count,
  unchanged: count,
  skippedCount: count,
  skipped: z.array(
    z.object({
      opportunityId: z.string(),
      reason: z.enum(['not_found', 'forbidden', 'closed', 'invalid_transition']),
    }),
  ),
});

const StatusSchema = z.enum(['pending', 'running', 'done', 'failed']);
const FailureSchema = z.enum(['requester_unavailable', 'invalid_request']);

type Row = typeof opportunityBulkOperations.$inferSelect;

function toSnapshot(row: Row): OpportunityBulkOperationSnapshot {
  const id = parseId<'OpportunityBulkOperation'>(row.id);
  if (id.isErr()) throw new Error(`Invalid bulk operation id ${row.id}`);
  return {
    id: id.value,
    action: ActionSchema.parse(fromJsonb(row.action)),
    selection: SelectionSchema.parse(fromJsonb(row.selection)),
    status: StatusSchema.parse(row.status),
    totals: TotalsSchema.parse(fromJsonb(row.totals)),
    cursor: row.cursor ?? undefined,
    failure: row.failure === null ? undefined : FailureSchema.parse(row.failure),
    requestedBy: row.requestedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt ?? undefined,
    finishedAt: row.finishedAt ?? undefined,
  };
}

/** Las acciones masivas encoladas (`opportunity_bulk_operations`). */
export class DrizzleOpportunityBulkOperationRepository implements OpportunityBulkOperationRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: OpportunityBulkOperationId): Promise<OpportunityBulkOperation | undefined> {
    const [row] = await this.db
      .select()
      .from(opportunityBulkOperations)
      .where(eq(opportunityBulkOperations.id, id))
      .limit(1);
    return row && OpportunityBulkOperation.restore(toSnapshot(row));
  }

  async save(operation: OpportunityBulkOperation, actorId: string): Promise<void> {
    const s = operation.toSnapshot();
    const values = {
      status: s.status,
      totals: toJsonb(s.totals),
      cursor: s.cursor ?? null,
      failure: s.failure ?? null,
      startedAt: s.startedAt ?? null,
      finishedAt: s.finishedAt ?? null,
      updatedAt: s.updatedAt,
      updatedBy: actorId,
    };
    await this.db
      .insert(opportunityBulkOperations)
      .values({
        id: s.id,
        action: toJsonb(s.action),
        selection: toJsonb(s.selection),
        requestedBy: s.requestedBy,
        createdAt: s.createdAt,
        createdBy: actorId,
        ...values,
      })
      .onConflictDoUpdate({ target: opportunityBulkOperations.id, set: values });
  }
}
