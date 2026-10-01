import {
  CreateRole,
  CreateUser,
  DeleteRole,
  ResolveSessionActor,
  RestoreRole,
  SetUserPermissions,
  UpdateRole,
} from '@norde/core/identity';
import { Actor } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { auditLog, rolePermissions, roles, userPermissions, users } from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { BetterAuthPasswordHasher } from './better-auth-password-hasher';
import { DrizzleRoleListQuery } from './drizzle-role-list-query';
import { DrizzleUserAccessQuery } from './drizzle-user-access-query';
import { createIdentityUnitOfWork } from './identity-unit-of-work';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const clock = new FixedClock('2026-10-01T12:00:00Z');
const uow = createIdentityUnitOfWork(db, { ids, clock });
const ADMIN = Actor.user(ids.next(), ['users:*', 'roles:*']);
const AUTH = Actor.system('auth', ['sessions:resolve']);
const TEMPORARY = 'temporal-12345'; // gitleaks:allow

const createRole = new CreateRole({ uow, ids, clock });
const updateRole = new UpdateRole({ uow, clock });
const listQuery = new DrizzleRoleListQuery(db);

async function newRole(name: string, permissions: readonly string[]) {
  const result = await createRole.execute({ name, permissions: [...permissions] }, ADMIN);
  if (result.isErr()) throw new Error(`could not create the role: ${result.error.type}`);
  return result.value.roleId;
}

async function newUser(email: string, roleIds: readonly string[]) {
  const result = await new CreateUser({
    uow,
    hasher: new BetterAuthPasswordHasher(),
    ids,
    clock,
  }).execute({ name: 'Camila', email, roleIds: [...roleIds], temporaryPassword: TEMPORARY }, ADMIN);
  if (result.isErr()) throw new Error(`could not create the user: ${result.error.type}`);
  return result.value.userId;
}

async function sessionOf(userId: string) {
  const resolved = await new ResolveSessionActor({
    users: new DrizzleUserAccessQuery(db),
  }).execute({ userId }, AUTH);
  if (resolved.isErr()) throw new Error('could not resolve the session');
  return resolved.value.actor;
}

describe('roles against Postgres', () => {
  it('creates and edits a role, syncing its permissions', async () => {
    const roleId = await newRole('Captador', ['properties:create', 'clients:read']);

    const result = await updateRole.execute(
      { roleId, name: 'Captador', permissions: ['properties:*', 'clients:read'] },
      ADMIN,
    );

    expect(result.isOk()).toBe(true);
    const stored = await db
      .select({ permission: rolePermissions.permission })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId))
      .orderBy(rolePermissions.permission);
    expect(stored.map((row) => row.permission)).toEqual(['clients:read', 'properties:*']);
    expect((await listQuery.findById(roleId))?.permissions).toEqual([
      'clients:read',
      'properties:*',
    ]);
    const entries = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entityId, roleId));
    expect(entries.map((e) => e.action)).toEqual(['role.created', 'role.updated']);
  });

  it('rejects a name that differs only in case or accents', async () => {
    await newRole('Gerente de sucursal', []);

    const result = await createRole.execute(
      { name: 'gerente de SUCURSAL', permissions: [] },
      ADMIN,
    );

    expect(result.isErr() && result.error).toEqual({ type: 'RoleNameTaken' });
  });

  it('applies the new permissions of a role to its users on their next request', async () => {
    const roleId = await newRole('Asesor', ['clients:read']);
    const userId = await newUser('camila@norde.com.ar', [roleId]);
    await db.update(users).set({ mustChangePassword: false }).where(eq(users.id, userId));
    // Ya eligió su contraseña: la sesión tiene los permisos de sus roles.
    expect((await sessionOf(userId)).can('clients:export')).toBe(false);

    await updateRole.execute(
      { roleId, name: 'Asesor', permissions: ['clients:read', 'clients:export'] },
      ADMIN,
    );

    expect((await sessionOf(userId)).can('clients:export')).toBe(true);
  });

  it('sends only unused roles to the trash and lists them apart', async () => {
    const used = await newRole('Asesor', ['clients:read']);
    const unused = await newRole('Pasante', ['clients:read']);
    await newUser('camila@norde.com.ar', [used]);
    const remove = new DeleteRole({ uow, clock });

    const inUse = await remove.execute({ roleId: used }, ADMIN);
    const deleted = await remove.execute({ roleId: unused }, ADMIN);

    expect(inUse.isErr() && inUse.error).toEqual({ type: 'RoleInUse', userCount: 1 });
    expect(deleted.isOk()).toBe(true);
    const [row] = await db.select().from(roles).where(eq(roles.id, unused));
    expect(row).toMatchObject({ deletedBy: ADMIN.id });
    expect(row?.deletedAt).toBeInstanceOf(Date);

    const base = {
      text: undefined,
      sort: { field: 'name', direction: 'asc' },
      offset: 0,
      limit: 10,
    } as const;
    const active = await listQuery.search({ ...base, view: 'active' });
    const trash = await listQuery.search({ ...base, view: 'trash' });
    expect(active.items.map((r) => [r.name, r.userCount])).toEqual([['Asesor', 1]]);
    expect(trash.items.map((r) => r.name)).toEqual(['Pasante']);

    // Un rol en la papelera no se asigna.
    await expect(newUser('bruno@norde.com.ar', [unused])).rejects.toThrow('RoleNotFound');

    expect((await new RestoreRole({ uow, clock }).execute({ roleId: unused }, ADMIN)).isOk()).toBe(
      true,
    );
    expect((await listQuery.search({ ...base, view: 'trash' })).total).toBe(0);
  });
});

describe('own permissions against Postgres', () => {
  it('stores grants and denies, and the session applies them', async () => {
    const roleId = await newRole('Alquileres', ['rentals:*', 'clients:read']);
    const userId = await newUser('camila@norde.com.ar', [roleId]);
    await db.update(users).set({ mustChangePassword: false }).where(eq(users.id, userId));

    const result = await new SetUserPermissions({ uow, clock }).execute(
      {
        userId,
        permissions: [
          { permission: 'rentals:delete', effect: 'deny' },
          { permission: 'clients:export', effect: 'grant' },
        ],
      },
      ADMIN,
    );

    expect(result.isOk()).toBe(true);
    const stored = await db
      .select({ permission: userPermissions.permission, effect: userPermissions.effect })
      .from(userPermissions)
      .where(eq(userPermissions.userId, userId))
      .orderBy(userPermissions.permission);
    expect(stored).toEqual([
      { permission: 'clients:export', effect: 'grant' },
      { permission: 'rentals:delete', effect: 'deny' },
    ]);
    const session = await sessionOf(userId);
    expect(session.can('clients:export')).toBe(true);
    expect(session.can('rentals:update')).toBe(true);
    expect(session.can('rentals:delete')).toBe(false);
  });
});
