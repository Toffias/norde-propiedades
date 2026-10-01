import type {
  AuditHistoryCriteria,
  AuditHistoryEntry,
  AuditHistoryQuery,
  HistoryChange,
} from '@norde/core/audit';
import type { PageSlice } from '@norde/core/shared';
import { and, asc, count, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { fromJsonb } from '../db/json';
import { auditLog } from '../db/schema';

// Los valores crudos del historial, tal como los guarda `toJsonb` (los `bigint` ya recuperados).
const HistoryValueSchema: z.ZodType<HistoryChange['before']> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.bigint(),
    z.null(),
    z.array(HistoryValueSchema),
    z.record(z.string(), HistoryValueSchema),
  ]),
);
const ChangesSchema = z
  .record(z.string(), z.object({ before: HistoryValueSchema, after: HistoryValueSchema }))
  .catch({});

/**
 * Historial de una entidad sobre `audit_log`, con el índice `(entity_type, entity_id, occurred_at)`:
 * los demás filtros (acción, autor, campos) se aplican dentro de las filas de esa entidad.
 */
export class DrizzleAuditHistoryQuery implements AuditHistoryQuery {
  constructor(private readonly db: DbExecutor) {}

  async list(criteria: AuditHistoryCriteria): Promise<PageSlice<AuditHistoryEntry>> {
    const where = and(
      eq(auditLog.entityType, criteria.entityType),
      eq(auditLog.entityId, criteria.entityId),
      criteria.actions === undefined ? undefined : inArray(auditLog.action, [...criteria.actions]),
      criteria.fields === undefined
        ? undefined
        : sql`${auditLog.changes} ?| ${sql.param([...criteria.fields])}::text[]`,
      criteria.actorId === undefined ? undefined : eq(auditLog.actorId, criteria.actorId),
      criteria.from === undefined ? undefined : gte(auditLog.occurredAt, criteria.from),
      criteria.to === undefined ? undefined : lt(auditLog.occurredAt, criteria.to),
    );
    const order = criteria.direction === 'asc' ? asc : desc;
    const [rows, totals] = await Promise.all([
      this.db
        .select({
          id: auditLog.id,
          occurredAt: auditLog.occurredAt,
          actorId: auditLog.actorId,
          source: auditLog.source,
          action: auditLog.action,
          changes: auditLog.changes,
        })
        .from(auditLog)
        .where(where)
        .orderBy(order(auditLog.occurredAt), order(auditLog.id))
        .offset(criteria.offset)
        .limit(criteria.limit),
      this.db.select({ total: count() }).from(auditLog).where(where),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        occurredAt: row.occurredAt,
        actorId: row.actorId,
        source: row.source ?? undefined,
        action: row.action,
        changes: ChangesSchema.parse(fromJsonb(row.changes ?? {})),
      })),
      total: totals[0]?.total ?? 0,
    };
  }
}
