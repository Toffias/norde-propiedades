import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { idempotencyKeys, outbox } from '../db/schema';

import { purgePlatformTables } from './platform-housekeeping';

const db = useTestDatabase();
const NOW = new Date('2026-03-01T10:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

async function event(recordedAt: Date, publishedAt: Date | null) {
  const id = randomUUID();
  await db.insert(outbox).values({
    id,
    eventType: 'clients.client_registered',
    aggregateId: 'agg',
    payload: {},
    occurredAt: recordedAt,
    recordedAt,
    publishedAt,
  });
  return id;
}

describe('purgePlatformTables', () => {
  it('deletes events published over a month ago and keys over a week old, never pending events', async () => {
    const oldPublished = await event(daysAgo(40), daysAgo(40));
    const recentPublished = await event(daysAgo(5), daysAgo(5));
    const oldPending = await event(daysAgo(40), null);
    await db.insert(idempotencyKeys).values([
      { actorId: 'u', command: 'c', key: randomUUID(), result: null, createdAt: daysAgo(8) },
      { actorId: 'u', command: 'c', key: randomUUID(), result: null, createdAt: daysAgo(1) },
    ]);

    const result = await purgePlatformTables(db, NOW);

    expect(result).toEqual({ outbox: 1, idempotencyKeys: 1 });
    const left = await db.select({ id: outbox.id }).from(outbox);
    expect(left.map((row) => row.id).sort()).toEqual([recentPublished, oldPending].sort());
    expect(left.map((row) => row.id)).not.toContain(oldPublished);
    expect(await db.select().from(idempotencyKeys)).toHaveLength(1);
  });
});

describe('audit_log trigger', () => {
  async function entry() {
    const id = randomUUID();
    await db.execute(sql`
      insert into core.audit_log
        (id, occurred_at, actor_id, action, entity_type, entity_id, client_ids, changes)
      values (${id}, now(), 'system:import', 'client.created', 'client', 'x', '{}', null)`);
    return id;
  }

  it('rejects updates and deletes of the history', async () => {
    const id = await entry();

    await expect(
      db.execute(sql`update core.audit_log set action = 'x' where id = ${id}`),
    ).rejects.toThrow();
    await expect(db.execute(sql`delete from core.audit_log where id = ${id}`)).rejects.toThrow();
  });

  it('allows the delete of a data erasure, inside its transaction', async () => {
    const id = await entry();

    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('norde.audit_erasure', 'on', true)`);
      await tx.execute(sql`delete from core.audit_log where id = ${id}`);
    });

    const rows = await db.execute(sql`select id from core.audit_log where id = ${id}`);
    expect(rows.rows).toHaveLength(0);
  });
});
