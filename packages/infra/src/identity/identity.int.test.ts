import { FixedClock } from '@norde/core/shared/testing';
import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import {
  accounts,
  auditLog,
  rolePermissions,
  roles,
  sessions,
  userPermissions,
  userRoles,
  users,
} from '../db/schema';
import { DrizzleAuditLog } from '../shared/drizzle-audit-log';
import type { InfraLogger } from '../shared/logger';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { BetterAuthSessionReader, createAuth } from './better-auth';
import { DrizzleUserAccessQuery } from './drizzle-user-access-query';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const clock = new FixedClock('2026-10-01T12:00:00Z');
const now = clock.now();
// Valores de prueba, solo para la base `_test`: no son secretos.
const PASSWORD = 'clave-de-prueba-123'; // gitleaks:allow

const warnings: string[] = [];
const logger: InfraLogger = {
  info: () => undefined,
  warn: (_details, message) => {
    warnings.push(message);
  },
  error: () => undefined,
};

const auth = createAuth({
  db,
  secret: 'secreto-de-tests-de-integracion-0123456789', // gitleaks:allow
  baseUrl: 'http://localhost:3001',
  ids,
  audit: new DrizzleAuditLog(db, ids, clock),
  logger,
  rateLimit: false,
});
const sessionReader = new BetterAuthSessionReader(auth);
const userAccess = new DrizzleUserAccessQuery(db);

async function insertUser(email: string, status: 'active' | 'suspended' = 'active') {
  const id = ids.next();
  await db.insert(users).values({
    id,
    email,
    name: 'Camila Pérez',
    status,
    createdAt: now,
    updatedAt: now,
    createdBy: 'system:import',
    updatedBy: 'system:import',
  });
  await db.insert(accounts).values({
    id: ids.next(),
    userId: id,
    accountId: id,
    providerId: 'credential',
    password: await hashPassword(PASSWORD),
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function insertRole(key: string, name: string, permissions: readonly string[]) {
  const id = ids.next();
  await db.insert(roles).values({
    id,
    key,
    name,
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    createdBy: 'system:import',
    updatedBy: 'system:import',
  });
  for (const permission of permissions) {
    await db
      .insert(rolePermissions)
      .values({ roleId: id, permission, createdAt: now, createdBy: 'system:import' });
  }
  return id;
}

function signIn(email: string, password = PASSWORD) {
  return auth.api.signInEmail({ body: { email, password }, headers: new Headers() });
}

/** La cookie de sesión firmada, tal como la manda el navegador después de entrar. */
async function signInCookie(email: string): Promise<Headers> {
  const { headers } = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    headers: new Headers(),
    returnHeaders: true,
  });
  return new Headers({ cookie: headers.get('set-cookie')?.split(';')[0] ?? '' });
}

function auditActions(entityId: string) {
  return db
    .select({ action: auditLog.action, actorId: auditLog.actorId, changes: auditLog.changes })
    .from(auditLog)
    .where(eq(auditLog.entityId, entityId))
    .orderBy(auditLog.occurredAt);
}

beforeEach(() => {
  warnings.length = 0;
});

describe('DrizzleUserAccessQuery', () => {
  it('returns the roles, the role permissions and the own permissions of the user', async () => {
    const userId = await insertUser('camila@norde.com.ar');
    const agent = await insertRole('agent', 'Agente', ['clients:read', 'clients:update']);
    const rentals = await insertRole('rentals-admin', 'Administrativo de alquileres', [
      'rentals:*',
      'clients:read',
    ]);
    await db.insert(userRoles).values([
      { userId, roleId: agent, createdAt: now, createdBy: 'system:import' },
      { userId, roleId: rentals, createdAt: now, createdBy: 'system:import' },
    ]);
    await db.insert(userPermissions).values({
      userId,
      permission: 'rentals:delete',
      effect: 'deny',
      createdAt: now,
      createdBy: 'system:import',
    });

    const access = await userAccess.findByUserId(userId);

    expect(access).toMatchObject({
      id: userId,
      name: 'Camila Pérez',
      email: 'camila@norde.com.ar',
      status: 'active',
      roles: [
        { key: 'rentals-admin', name: 'Administrativo de alquileres' },
        { key: 'agent', name: 'Agente' },
      ],
      userPermissions: [{ permission: 'rentals:delete', effect: 'deny' }],
    });
    expect([...(access?.rolePermissions ?? [])].sort()).toEqual([
      'clients:read',
      'clients:read',
      'clients:update',
      'rentals:*',
    ]);
  });

  it('returns nothing for an unknown user', async () => {
    expect(await userAccess.findByUserId(ids.next())).toBeUndefined();
  });

  it('fails loudly on a malformed permission instead of ignoring it', async () => {
    const userId = await insertUser('camila@norde.com.ar');
    const role = await insertRole('broken', 'Roto', ['clients-read']);
    await db
      .insert(userRoles)
      .values({ userId, roleId: role, createdAt: now, createdBy: 'system:import' });

    await expect(userAccess.findByUserId(userId)).rejects.toThrow('Invalid permission');
  });
});

describe('Better Auth', () => {
  it('signs in with the password and audits it', async () => {
    const userId = await insertUser('camila@norde.com.ar');

    const headers = await signInCookie('Camila@Norde.com.ar');

    expect(await sessionReader.currentUserId(headers)).toBe(userId);
    expect(await auditActions(userId)).toEqual([
      { action: 'user.signed-in', actorId: userId, changes: null },
    ]);
  });

  it('rejects a wrong password and audits the failed attempt without the email', async () => {
    const userId = await insertUser('camila@norde.com.ar');

    await expect(signIn('camila@norde.com.ar', 'otra-clave-123')).rejects.toMatchObject({
      statusCode: 401,
    });

    const entries = await auditActions(userId);
    expect(entries).toEqual([
      {
        action: 'user.sign-in-failed',
        actorId: 'system:auth',
        changes: { reason: { before: null, after: 'INVALID_EMAIL_OR_PASSWORD' } },
      },
    ]);
    expect(JSON.stringify(entries)).not.toContain('camila@');
  });

  it('only logs a warning when the email does not exist', async () => {
    await expect(signIn('nadie@norde.com.ar')).rejects.toMatchObject({ statusCode: 401 });

    expect(await db.select().from(auditLog)).toEqual([]);
    expect(warnings).toEqual(['Sign-in failed for an unknown email']);
  });

  it('gives no session to a suspended user, even with the right password', async () => {
    const userId = await insertUser('camila@norde.com.ar', 'suspended');

    await expect(signIn('camila@norde.com.ar')).rejects.toMatchObject({ statusCode: 401 });

    expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toEqual([]);
  });

  it('closes the session on sign out and audits it', async () => {
    const userId = await insertUser('camila@norde.com.ar');
    const headers = await signInCookie('camila@norde.com.ar');

    await auth.api.signOut({ headers });

    expect(await sessionReader.currentUserId(headers)).toBeUndefined();
    expect((await auditActions(userId)).map((entry) => entry.action)).toEqual([
      'user.signed-in',
      'user.signed-out',
    ]);
  });

  it('does not let anyone sign up', async () => {
    await expect(
      auth.api.signUpEmail({
        body: { email: 'nuevo@norde.com.ar', password: PASSWORD, name: 'Nuevo' },
        headers: new Headers(),
      }),
    ).rejects.toBeDefined();

    expect(await db.select().from(users)).toEqual([]);
  });
});
