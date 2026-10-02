import type { ClientErasure, ErasureRecord } from '@norde/core/clients';
import { and, arrayOverlaps, eq, inArray } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { auditLog, clients, erasureRecords, importMappings } from '../db/schema';

/**
 * Supresión de datos de un cliente (Ley 25.326). Es el único adaptador que borra entradas de
 * `audit_log` (ADR 0015). Lo demás del módulo cae con las foreign keys `on delete cascade` de
 * `clients`.
 */
export class DrizzleClientErasure implements ClientErasure {
  constructor(private readonly db: DbExecutor) {}

  async mergedInto(clientId: string, limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.mergedIntoId, clientId))
      .limit(limit);
    return rows.map((row) => row.id);
  }

  async erase(clientIds: readonly string[], now: Date): Promise<void> {
    if (clientIds.length === 0) return;
    const ids = [...clientIds];
    await this.db.delete(auditLog).where(arrayOverlaps(auditLog.clientIds, ids));
    await this.db.delete(clients).where(inArray(clients.id, ids));
    await this.db
      .update(importMappings)
      .set({ erasedAt: now, updatedAt: now })
      .where(and(eq(importMappings.entityType, 'client'), inArray(importMappings.internalId, ids)));
  }

  async record(record: ErasureRecord): Promise<void> {
    await this.db.insert(erasureRecords).values({
      id: record.id,
      erasedEntityType: record.erasedEntityType,
      erasedEntityId: record.erasedEntityId,
      requestedAt: record.requestedAt,
      executedBy: record.executedBy,
      executedAt: record.executedAt,
    });
  }
}
