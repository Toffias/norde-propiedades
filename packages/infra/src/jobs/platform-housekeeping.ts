import { sql } from 'drizzle-orm';

import type { Database } from '../db/client';

/** Lo publicado del outbox se guarda un mes, para revisar un evento si hace falta. */
export const OUTBOX_RETENTION_DAYS = 30;
/** Una clave de idempotencia sirve para un reintento del mismo pedido: una semana sobra. */
export const IDEMPOTENCY_RETENTION_DAYS = 7;
/** Filas por `DELETE`: la purga no bloquea la tabla con una sola sentencia enorme. */
const BATCH_SIZE = 5000;

const DAY_MS = 86_400_000;

export interface HousekeepingResult {
  readonly outbox: number;
  readonly idempotencyKeys: number;
}

/**
 * Mantenimiento diario de las tablas de plataforma, que solo crecen: borra los eventos del outbox
 * publicados hace más de `OUTBOX_RETENTION_DAYS` (los pendientes nunca) y las claves de
 * idempotencia de más de `IDEMPOTENCY_RETENTION_DAYS`. No es una regla de negocio: no pasa por el
 * core ni se audita.
 */
export async function purgePlatformTables(db: Database, now: Date): Promise<HousekeepingResult> {
  const outboxBefore = new Date(now.getTime() - OUTBOX_RETENTION_DAYS * DAY_MS);
  const keysBefore = new Date(now.getTime() - IDEMPOTENCY_RETENTION_DAYS * DAY_MS);
  const outbox = await deleteInBatches(
    db,
    sql`delete from core.outbox where id in (
      select id from core.outbox
      where published_at is not null and published_at < ${outboxBefore}
      limit ${BATCH_SIZE})`,
  );
  const idempotencyKeys = await deleteInBatches(
    db,
    sql`delete from core.idempotency_keys where ctid in (
      select ctid from core.idempotency_keys where created_at < ${keysBefore} limit ${BATCH_SIZE})`,
  );
  return { outbox, idempotencyKeys };
}

async function deleteInBatches(db: Database, statement: ReturnType<typeof sql>): Promise<number> {
  let total = 0;
  for (;;) {
    const result = await db.execute(statement);
    const deleted = result.rowCount ?? 0;
    total += deleted;
    if (deleted < BATCH_SIZE) return total;
  }
}
