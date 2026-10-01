import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';

import { clients, rolePermissions, roles, userPermissions, userRoles, users } from './schema';

const db = useTestDatabase();

const ID = '01900000-0000-7000-8000-000000000001';
const AT = new Date('2026-03-01T10:00:00Z');

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

describe('roles and permissions', () => {
  const ROLE_ID = '01900000-0000-7000-8000-0000000000a1';
  const audit = { createdAt: AT, updatedAt: AT, createdBy: 'test', updatedBy: 'test' };
  const link = { createdAt: AT, createdBy: 'test' };

  async function userWithRole() {
    await db
      .insert(users)
      .values({ id: ID, email: 'camila@example.com', name: 'Camila', ...audit });
    await db.insert(roles).values({ id: ROLE_ID, key: 'agent', name: 'Agente', ...audit });
    await db
      .insert(rolePermissions)
      .values({ roleId: ROLE_ID, permission: 'clients:read', ...link });
    await db.insert(userRoles).values({ userId: ID, roleId: ROLE_ID, ...link });
    await db
      .insert(userPermissions)
      .values({ userId: ID, permission: 'clients:export', effect: 'grant', ...link });
  }

  it('does not delete a role that is assigned to a user', async () => {
    await userWithRole();

    const code = await pgErrorCode(db.delete(roles).where(sql`${roles.id} = ${ROLE_ID}`));

    // restrict_violation: `user_roles.role_id` es `on delete restrict`.
    expect(code).toBe('23001');
  });

  it("removes a user's roles and own permissions with the user", async () => {
    await userWithRole();

    await db.delete(users).where(sql`${users.id} = ${ID}`);

    expect(await db.select().from(userRoles)).toHaveLength(0);
    expect(await db.select().from(userPermissions)).toHaveLength(0);
    expect(await db.select().from(rolePermissions)).toHaveLength(1);
  });
});
