import { sql, type SQL } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';

import { auditLog, clients } from './schema';

const db = useTestDatabase();

const ID = '01900000-0000-7000-8000-000000000001';
const AT = new Date('2026-03-01T10:00:00Z');

/** Ejecuta `statement` con el rol dado, en su propia transacción. */
function asRole(role: 'norde_app' | 'norde_erasure', statement: SQL) {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`set local role ${role}`));
    await tx.execute(statement);
  });
}

/** Código de error de Postgres de una consulta fallida (drizzle lo envuelve en `cause`). */
async function pgErrorCode(query: Promise<unknown>): Promise<string | undefined> {
  try {
    await query;
    return undefined;
  } catch (error: unknown) {
    const cause = error instanceof Error ? error.cause : undefined;
    return typeof cause === 'object' && cause !== null && 'code' in cause
      ? String(cause.code)
      : undefined;
  }
}

describe('audit_log permissions', () => {
  it('lets the app role insert and read entries, but not change them', async () => {
    await asRole(
      'norde_app',
      sql`insert into core.audit_log (id, actor_id, action, entity_type, entity_id, occurred_at)
        values (${ID}, 'system:agent-ia', 'client.registered', 'client', ${ID}, now())`,
    );
    await asRole('norde_app', sql`select * from core.audit_log`);

    const denied = '42501';
    expect(
      await pgErrorCode(asRole('norde_app', sql`update core.audit_log set action = 'x'`)),
    ).toBe(denied);
    expect(await pgErrorCode(asRole('norde_app', sql`delete from core.audit_log`))).toBe(denied);
    expect(await pgErrorCode(asRole('norde_app', sql`truncate core.audit_log`))).toBe(denied);

    const [entry] = await db.select().from(auditLog);
    expect(entry?.action).toBe('client.registered');
  });

  it('lets the erasure role delete the entries of a client', async () => {
    await db.insert(auditLog).values({
      id: ID,
      actorId: 'system:agent-ia',
      action: 'client.registered',
      entityType: 'client',
      entityId: ID,
      clientIds: [ID],
      occurredAt: AT,
    });

    await asRole(
      'norde_erasure',
      sql`delete from core.audit_log where ${ID}::uuid = any(client_ids)`,
    );

    expect(await db.select().from(auditLog)).toHaveLength(0);
  });
});

describe('management data model', () => {
  it('ships exactly one row in each single-row settings table', async () => {
    const tables = [
      'company_settings',
      'opportunity_settings',
      'inquiry_settings',
      'follow_up_settings',
      'property_settings',
      'reservation_settings',
    ];
    for (const table of tables) {
      const result = await db.execute<{ rows: number }>(
        sql.raw(`select count(*)::int as rows from core.${table}`),
      );
      expect(result.rows[0]?.rows, table).toBe(1);
    }

    const code = await pgErrorCode(
      db.execute(sql`insert into core.company_settings (id, created_at, updated_at, created_by, updated_by)
        values (false, now(), now(), 'test', 'test')`),
    );
    expect(code).toBe('23514');
  });

  it('generates a lowercase, accent-free search text for clients', async () => {
    await db.insert(clients).values({
      id: ID,
      name: 'José García',
      email: 'Jose@Example.com',
      createdAt: AT,
      updatedAt: AT,
    });

    const matches = await db
      .select({ searchText: clients.searchText })
      .from(clients)
      .where(sql`${clients.searchText} like ${'%jose garcia%'}`);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.searchText).toContain('jose@example.com');
  });
});
