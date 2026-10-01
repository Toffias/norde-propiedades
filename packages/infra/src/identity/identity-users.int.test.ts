import {
  ChangeOwnPassword,
  CreateUser,
  ResetUserPassword,
  SuspendUser,
  User,
  type UserListCriteria,
} from '@norde/core/identity';
import { Actor, Email, parseId } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { auditLog, branches, outbox, roles, sessions, userRoles, users } from '../db/schema';
import { DrizzleAuditLog } from '../shared/drizzle-audit-log';
import type { InfraLogger } from '../shared/logger';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { BetterAuthPasswordHasher } from './better-auth-password-hasher';
import { BetterAuthSessionReader, createAuth } from './better-auth';
import { DrizzleUserAccessQuery } from './drizzle-user-access-query';
import { DrizzleRoleListQuery } from './drizzle-role-list-query';
import { DrizzleUserListQuery } from './drizzle-user-list-query';
import { DrizzleUserRepository } from './drizzle-user-repository';
import { createIdentityUnitOfWork } from './identity-unit-of-work';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const clock = new FixedClock('2026-10-01T12:00:00Z');
const now = clock.now();
// Valores de prueba, solo para la base `_test`: no son secretos.
const TEMPORARY = 'temporal-12345'; // gitleaks:allow
const OWN = 'mi-clave-nueva-1'; // gitleaks:allow

const silent: InfraLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
const auth = createAuth({
  db,
  secret: 'secreto-de-tests-de-integracion-0123456789', // gitleaks:allow
  baseUrl: 'http://localhost:3001',
  ids,
  audit: new DrizzleAuditLog(db, ids, clock),
  logger: silent,
  rateLimit: false,
});
const sessionReader = new BetterAuthSessionReader(auth);
const uow = createIdentityUnitOfWork(db, { ids, clock });
const hasher = new BetterAuthPasswordHasher();
const ADMIN = Actor.user(ids.next(), ['users:*']);

async function insertRole(key: string, name: string) {
  const id = ids.next();
  await db.insert(roles).values({
    id,
    key,
    name,
    createdAt: now,
    updatedAt: now,
    createdBy: 'system:import',
    updatedBy: 'system:import',
  });
  return id;
}

async function createUser(email: string, roleIds: readonly string[], name = 'Camila Pérez') {
  const result = await new CreateUser({ uow, hasher, ids, clock }).execute(
    { name, email, roleIds: [...roleIds], temporaryPassword: TEMPORARY },
    ADMIN,
  );
  if (result.isErr()) throw new Error(`could not create the user: ${result.error.type}`);
  return result.value.userId;
}

async function signInCookie(email: string, password: string): Promise<Headers> {
  const { headers } = await auth.api.signInEmail({
    body: { email, password },
    headers: new Headers(),
    returnHeaders: true,
  });
  return new Headers({ cookie: headers.get('set-cookie')?.split(';')[0] ?? '' });
}

function auditActions(entityId: string) {
  return db
    .select({ action: auditLog.action, actorId: auditLog.actorId })
    .from(auditLog)
    .where(eq(auditLog.entityId, entityId))
    .orderBy(auditLog.occurredAt, auditLog.id);
}

describe('identity users against Postgres', () => {
  it('creates a user who signs in with the temporary password', async () => {
    const agent = await insertRole('agent', 'Agente');
    const userId = await createUser('camila@norde.com.ar', [agent]);

    const headers = await signInCookie('camila@norde.com.ar', TEMPORARY);

    expect(await sessionReader.currentUserId(headers)).toBe(userId);
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row).toMatchObject({ createdBy: ADMIN.id, mustChangePassword: true });
    // El hook de Better Auth registra el último ingreso.
    expect(row?.lastLoginAt).toBeInstanceOf(Date);
    expect(await db.select().from(userRoles).where(eq(userRoles.userId, userId))).toEqual([
      { userId, roleId: agent, createdAt: now, createdBy: ADMIN.id },
    ]);
    expect((await db.select().from(outbox)).map((e) => e.eventType)).toEqual([
      'identity.user_created',
    ]);
    expect((await auditActions(userId)).map((e) => e.action)).toEqual([
      'user.created',
      'user.signed-in',
    ]);
  });

  it('rolls everything back when the email is taken', async () => {
    const agent = await insertRole('agent', 'Agente');
    await createUser('camila@norde.com.ar', [agent]);

    const result = await new CreateUser({ uow, hasher, ids, clock }).execute(
      {
        name: 'Otra',
        email: 'camila@norde.com.ar',
        roleIds: [agent],
        temporaryPassword: TEMPORARY,
      },
      ADMIN,
    );

    expect(result.isErr() && result.error).toEqual({ type: 'EmailTaken' });
    expect(await db.select({ id: users.id }).from(users)).toHaveLength(1);
  });

  it('closes the open sessions when the user is suspended', async () => {
    const agent = await insertRole('agent', 'Agente');
    const userId = await createUser('camila@norde.com.ar', [agent]);
    const headers = await signInCookie('camila@norde.com.ar', TEMPORARY);

    const result = await new SuspendUser({ uow, clock }).execute({ userId }, ADMIN);

    expect(result.isOk()).toBe(true);
    expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toEqual([]);
    expect(await sessionReader.currentUserId(headers)).toBeUndefined();
    await expect(signInCookie('camila@norde.com.ar', TEMPORARY)).rejects.toThrow();
  });

  it('resets the password and lets the user choose their own', async () => {
    const agent = await insertRole('agent', 'Agente');
    const userId = await createUser('camila@norde.com.ar', [agent]);
    const session = Actor.user(userId, []);

    const changed = await new ChangeOwnPassword({ uow, hasher, clock }).execute(
      { currentPassword: TEMPORARY, newPassword: OWN },
      session,
    );
    expect(changed.isOk()).toBe(true);
    await expect(signInCookie('camila@norde.com.ar', TEMPORARY)).rejects.toThrow();
    const headers = await signInCookie('camila@norde.com.ar', OWN);
    expect(await sessionReader.currentUserId(headers)).toBe(userId);

    const reset = await new ResetUserPassword({ uow, hasher, clock }).execute(
      { userId, temporaryPassword: TEMPORARY },
      ADMIN,
    );
    expect(reset.isOk()).toBe(true);
    expect(await sessionReader.currentUserId(headers)).toBeUndefined();
    await expect(signInCookie('camila@norde.com.ar', OWN)).rejects.toThrow();
    expect((await auditActions(userId)).map((e) => e.action)).toEqual([
      'user.created',
      'user.password-changed',
      // La temporal ya no sirve: el intento fallido también queda en el historial.
      'user.sign-in-failed',
      'user.signed-in',
      'user.password-reset',
      'user.sign-in-failed',
    ]);
  });
});

describe('DrizzleUserRepository', () => {
  it('syncs the roles of the user: removes the old ones and adds the new ones', async () => {
    const agent = await insertRole('agent', 'Agente');
    const manager = await insertRole('manager', 'Gerente');
    const rentals = await insertRole('rentals-admin', 'Alquileres');
    const repository = new DrizzleUserRepository(db);
    const id = parseId<'User'>(ids.next());
    const email = Email.create('camila@norde.com.ar');
    if (id.isErr() || email.isErr()) throw new Error('invalid fixture');
    const created = User.create({
      id: id.value,
      name: 'Camila',
      email: email.value,
      roleIds: [agent, manager],
      now,
    });
    if (created.isErr()) throw new Error('invalid fixture');
    await repository.save(created.value, ADMIN.id);

    const user = await repository.findById(id.value);
    user?.assignRoles([manager, rentals], now);
    if (user) await repository.save(user, ADMIN.id);

    expect((await repository.findById(id.value))?.roleIds).toEqual([manager, rentals].sort());
    expect((await repository.findByEmail(email.value))?.id).toBe(id.value);
  });
});

describe('DrizzleUserListQuery', () => {
  const query = new DrizzleUserListQuery(db);
  const base: Omit<UserListCriteria, 'offset' | 'limit'> = {
    status: 'active',
    text: undefined,
    branchId: undefined,
    teamId: undefined,
    sort: { field: 'name', direction: 'asc' },
  };

  async function seedUsers() {
    const agent = await insertRole('agent', 'Agente');
    const manager = await insertRole('manager', 'Gerente');
    const names = ['Ana', 'Bruno', 'Camila', 'Dolores', 'Esteban', 'Facundo', 'Gisela'];
    const created: Record<string, string> = {};
    for (const [index, name] of names.entries()) {
      clock.advance(1000);
      created[name] = await createUser(
        `${name.toLowerCase()}@norde.com.ar`,
        index === 0 ? [agent, manager] : [agent],
        name,
      );
    }
    return { agent, manager, created };
  }

  it('pages without losing or repeating rows, in every sort', async () => {
    await seedUsers();

    for (const field of ['name', 'email', 'lastLoginAt', 'createdAt'] as const) {
      for (const direction of ['asc', 'desc'] as const) {
        const seen: string[] = [];
        for (let offset = 0; offset < 7; offset += 3) {
          const page = await query.search({
            ...base,
            sort: { field, direction },
            offset,
            limit: 3,
          });
          expect(page.total).toBe(7);
          seen.push(...page.items.map((item) => item.id));
        }
        expect(new Set(seen).size).toBe(7);
      }
    }
  });

  it('sorts by name and returns the roles of each row', async () => {
    const { agent, manager } = await seedUsers();

    const page = await query.search({ ...base, offset: 0, limit: 2 });

    expect(page.items.map((item) => item.name)).toEqual(['Ana', 'Bruno']);
    expect(page.items[0]?.roles.map((role) => role.id).sort()).toEqual([agent, manager].sort());
    expect(page.items[1]?.roles.map((role) => role.key)).toEqual(['agent']);
  });

  it('filters by status and by name or email, ignoring case and accents', async () => {
    const { created } = await seedUsers();
    const camila = created.Camila;
    if (camila === undefined) throw new Error('missing fixture');
    await new SuspendUser({ uow, clock }).execute({ userId: camila }, ADMIN);

    const suspended = await query.search({ ...base, status: 'suspended', offset: 0, limit: 10 });
    expect(suspended.items.map((item) => item.name)).toEqual(['Camila']);

    await db
      .update(users)
      .set({ name: 'Dolores Ñandú' })
      .where(eq(users.email, 'dolores@norde.com.ar'));
    const byName = await query.search({ ...base, text: 'NANDU', offset: 0, limit: 10 });
    expect(byName.items.map((item) => item.name)).toEqual(['Dolores Ñandú']);

    const byEmail = await query.search({ ...base, text: 'gisela@', offset: 0, limit: 10 });
    expect(byEmail.total).toBe(1);

    const literal = await query.search({ ...base, text: '%', offset: 0, limit: 10 });
    expect(literal.total).toBe(0);
  });
});

describe('DrizzleRoleListQuery', () => {
  it('counts the users of each role and filters by name', async () => {
    const agent = await insertRole('agent', 'Agente / Asesor');
    await insertRole('manager', 'Gerente / Broker');
    await createUser('camila@norde.com.ar', [agent]);
    await createUser('bruno@norde.com.ar', [agent]);

    const all = await new DrizzleRoleListQuery(db).search({
      view: 'active',
      text: undefined,
      sort: { field: 'name', direction: 'asc' },
      offset: 0,
      limit: 10,
    });
    const filtered = await new DrizzleRoleListQuery(db).search({
      view: 'active',
      text: 'géren',
      sort: { field: 'name', direction: 'asc' },
      offset: 0,
      limit: 10,
    });

    expect(all.items.map((role) => [role.key, role.userCount])).toEqual([
      ['agent', 2],
      ['manager', 0],
    ]);
    expect(filtered.items.map((role) => role.key)).toEqual(['manager']);
  });
});

describe('DrizzleUserAccessQuery with a branch', () => {
  it('returns the branch of the user, for the ownership rules', async () => {
    const agent = await insertRole('agent', 'Agente');
    const userId = await createUser('camila@norde.com.ar', [agent]);
    const branchId = ids.next();
    await db.insert(branches).values({
      id: branchId,
      name: 'Casa central',
      createdAt: now,
      updatedAt: now,
      createdBy: 'system:import',
      updatedBy: 'system:import',
    });
    await db.update(users).set({ branchId }).where(eq(users.id, userId));

    expect((await new DrizzleUserAccessQuery(db).findByUserId(userId))?.branchId).toBe(branchId);
  });
});
