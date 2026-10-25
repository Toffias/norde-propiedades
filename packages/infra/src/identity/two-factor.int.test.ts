import { FixedClock } from '@norde/core/shared/testing';
import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { insertTestBranch, useTestDatabase } from '../../test/database';
import { accounts, auditLog, sessions, twoFactors, users } from '../db/schema';
import { DrizzleAuditLog } from '../shared/drizzle-audit-log';
import type { InfraLogger } from '../shared/logger';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { createAuth } from './better-auth';
import { DrizzleCredentialStore } from './drizzle-identity-ports';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const clock = new FixedClock('2026-10-01T12:00:00Z');
const now = clock.now();
// Valores de prueba, solo para la base `_test`: no son secretos.
const PASSWORD = 'clave-de-prueba-123'; // gitleaks:allow
const WRONG_PASSWORD = 'otra-clave-123'; // gitleaks:allow
const EMAIL = 'camila@norde.com.ar';

const logger: InfraLogger = {
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
  logger,
  rateLimit: false,
});

async function insertUser() {
  const id = ids.next();
  await db.insert(users).values({
    id,
    email: EMAIL,
    name: 'Camila Pérez',
    branchId: await insertTestBranch(db),
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

/** Las cookies que manda el navegador después de una respuesta (`name=value`, sin atributos). */
function cookiesFrom(headers: Headers): Headers {
  const pairs = headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0] ?? '')
    .filter((pair) => !pair.endsWith('='));
  return new Headers({ cookie: pairs.join('; ') });
}

async function signIn() {
  return auth.api.signInEmail({
    body: { email: EMAIL, password: PASSWORD },
    headers: new Headers(),
    returnHeaders: true,
  });
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** El URI lleva el secreto en base32; `generateTOTP` lo quiere como texto. */
function decodeBase32(encoded: string): string {
  let bits = '';
  for (const char of encoded.replace(/=+$/, '')) {
    bits += BASE32.indexOf(char).toString(2).padStart(5, '0');
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return String.fromCharCode(...bytes.map((byte) => parseInt(byte, 2)));
}

async function codeFor(totpUri: string) {
  const secret = decodeBase32(new URL(totpUri).searchParams.get('secret') ?? '');
  const { code } = await auth.api.generateTOTP({ body: { secret } });
  return code;
}

/** Primer paso de la activación: el QR (URI) y los códigos de respaldo. */
async function startSetup(session: Headers) {
  const setup = await auth.api.enableTwoFactor({ body: { password: PASSWORD }, headers: session });
  if (setup.method !== 'totp') throw new Error('Expected a TOTP setup');
  return setup;
}

/** Ingresa, activa la verificación en dos pasos y devuelve la sesión y lo que vio el usuario. */
async function enableTwoFactor() {
  const signedIn = await signIn();
  const { totpURI: totpUri, backupCodes } = await startSetup(cookiesFrom(signedIn.headers));
  const verified = await auth.api.verifyTOTP({
    body: { code: await codeFor(totpUri) },
    headers: cookiesFrom(signedIn.headers),
    returnHeaders: true,
  });
  return { session: cookiesFrom(verified.headers), totpUri, backupCodes };
}

function auditActions(userId: string) {
  return db
    .select({ action: auditLog.action, actorId: auditLog.actorId, changes: auditLog.changes })
    .from(auditLog)
    .where(eq(auditLog.entityId, userId))
    .orderBy(auditLog.occurredAt);
}

async function twoFactorEnabled(userId: string) {
  const [user] = await db
    .select({ enabled: users.twoFactorEnabled })
    .from(users)
    .where(eq(users.id, userId));
  return user?.enabled;
}

describe('Two-factor authentication', () => {
  it('is enabled only after the first code from the app, and audits it', async () => {
    const userId = await insertUser();
    const signedIn = await signIn();

    const setup = await startSetup(cookiesFrom(signedIn.headers));
    expect(setup.backupCodes).toHaveLength(10);
    expect(setup.totpURI).toContain('Norde%20Gesti%C3%B3n');
    expect(await twoFactorEnabled(userId)).toBe(false);

    await auth.api.verifyTOTP({
      body: { code: await codeFor(setup.totpURI) },
      headers: cookiesFrom(signedIn.headers),
    });

    expect(await twoFactorEnabled(userId)).toBe(true);
    expect((await auditActions(userId)).map((entry) => entry.action)).toEqual([
      'user.signed-in',
      'user.two-factor-enabled',
    ]);
  });

  it('does not enable it with a wrong password', async () => {
    const userId = await insertUser();
    const signedIn = await signIn();

    await expect(
      auth.api.enableTwoFactor({
        body: { password: WRONG_PASSWORD },
        headers: cookiesFrom(signedIn.headers),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await db.select().from(twoFactors).where(eq(twoFactors.userId, userId))).toEqual([]);
  });

  it('asks for the code after the password and audits the sign-in only with it', async () => {
    const userId = await insertUser();
    const { totpUri } = await enableTwoFactor();
    await db.delete(auditLog);
    await db.delete(sessions);

    const challenge = await signIn();
    expect(challenge.response).toMatchObject({ twoFactorRedirect: true });
    expect(await db.select().from(sessions)).toEqual([]);

    await expect(
      auth.api.verifyTOTP({ body: { code: '000000' }, headers: cookiesFrom(challenge.headers) }),
    ).rejects.toMatchObject({ statusCode: 401 });
    await auth.api.verifyTOTP({
      body: { code: await codeFor(totpUri) },
      headers: cookiesFrom(challenge.headers),
    });

    expect(await db.select().from(sessions)).toHaveLength(1);
    expect(await auditActions(userId)).toEqual([
      {
        action: 'user.sign-in-failed',
        actorId: 'system:auth',
        changes: {
          reason: { before: null, after: 'INVALID_CODE' },
          secondFactor: { before: null, after: 'totp' },
        },
      },
      {
        action: 'user.signed-in',
        actorId: userId,
        changes: { secondFactor: { before: null, after: 'totp' } },
      },
    ]);
  });

  it('signs in with a backup code, only once', async () => {
    const userId = await insertUser();
    const { backupCodes } = await enableTwoFactor();
    const code = backupCodes[0] ?? '';
    await db.delete(auditLog);

    const first = await signIn();
    await auth.api.verifyBackupCode({ body: { code }, headers: cookiesFrom(first.headers) });
    const second = await signIn();
    await expect(
      auth.api.verifyBackupCode({ body: { code }, headers: cookiesFrom(second.headers) }),
    ).rejects.toMatchObject({ statusCode: 401 });

    expect(await auditActions(userId)).toEqual([
      {
        action: 'user.signed-in',
        actorId: userId,
        changes: { secondFactor: { before: null, after: 'backup-code' } },
      },
      {
        action: 'user.sign-in-failed',
        actorId: 'system:auth',
        changes: {
          reason: { before: null, after: 'INVALID_BACKUP_CODE' },
          secondFactor: { before: null, after: 'backup-code' },
        },
      },
    ]);
  });

  it('regenerates the backup codes and audits it', async () => {
    const userId = await insertUser();
    const { session, backupCodes } = await enableTwoFactor();

    const regenerated = await auth.api.generateBackupCodes({
      body: { password: PASSWORD },
      headers: session,
    });

    expect(regenerated.backupCodes).toHaveLength(10);
    expect(regenerated.backupCodes).not.toContain(backupCodes[0]);
    expect((await auditActions(userId)).at(-1)?.action).toBe(
      'user.two-factor-backup-codes-regenerated',
    );
  });

  it('is disabled with the password, and audits it', async () => {
    const userId = await insertUser();
    const { session } = await enableTwoFactor();

    await auth.api.disableTwoFactor({ body: { password: PASSWORD }, headers: session });

    expect(await twoFactorEnabled(userId)).toBe(false);
    expect(await db.select().from(twoFactors).where(eq(twoFactors.userId, userId))).toEqual([]);
    expect((await auditActions(userId)).at(-1)?.action).toBe('user.two-factor-disabled');
    const signedIn = await signIn();
    expect(signedIn.response).toMatchObject({ user: { id: userId } });
  });

  it('is removed by an administrator through the credential store', async () => {
    const userId = await insertUser();
    await enableTwoFactor();
    const credentials = new DrizzleCredentialStore(db, ids, clock);
    expect(await credentials.hasTwoFactor(userId)).toBe(true);

    await credentials.removeTwoFactor(userId);

    expect(await credentials.hasTwoFactor(userId)).toBe(false);
    expect(await db.select().from(twoFactors).where(eq(twoFactors.userId, userId))).toEqual([]);
    const signedIn = await signIn();
    expect(signedIn.response).toMatchObject({ user: { id: userId } });
  });
});
