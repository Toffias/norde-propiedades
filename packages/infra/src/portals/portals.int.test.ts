import { ConnectPortalAccount, DisconnectPortalAccount } from '@norde/core/portals';
import { FakePortalAuthorizer } from '@norde/core/portals/testing';
import { Actor } from '@norde/core/shared';
import { FixedClock, unwrap, unwrapErr } from '@norde/core/shared/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { AesGcmSecretCipher } from '../adapters/crypto/aes-gcm-secret-cipher';
import { auditLog, portalAccounts } from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import {
  DrizzlePortalAccountRepository,
  DrizzlePortalCredentialStore,
} from './drizzle-portal-accounts';
import { createPortalsUnitOfWork } from './portals-unit-of-work';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const clock = new FixedClock('2026-10-05T12:00:00Z');
const cipher = new AesGcmSecretCipher(Buffer.alloc(32, 3).toString('base64')); // gitleaks:allow
const ADMIN = Actor.user('01920000-0000-7000-8000-0000000000ad', ['portals:*']);

const CALLBACK = {
  portal: 'mercadolibre',
  code: 'TG-code',
  state: 'state-1',
  expectedState: 'state-1',
  codeVerifier: 'v'.repeat(43),
} as const;

function setup() {
  const uow = createPortalsUnitOfWork(db, { ids, clock, cipher });
  const authorizer = new FakePortalAuthorizer();
  return {
    authorizer,
    connect: new ConnectPortalAccount({ uow, authorizer, clock }),
    disconnect: new DisconnectPortalAccount({ uow }),
    accounts: new DrizzlePortalAccountRepository(db, clock),
    credentials: new DrizzlePortalCredentialStore(db, cipher),
  };
}

describe('portal accounts (Postgres)', () => {
  it('lists every portal as not connected when there are no rows', async () => {
    const { accounts } = setup();
    const all = await accounts.all();
    expect(all.map((account) => account.toSnapshot())).toEqual([
      { portal: 'mercadolibre', isEnabled: false, connection: undefined },
      { portal: 'mercadolibre_developments', isEnabled: false, connection: undefined },
    ]);
  });

  it('connects an account with its credentials encrypted and audits it', async () => {
    const { connect, accounts, credentials } = setup();

    unwrap(await connect.execute(CALLBACK, ADMIN));

    expect((await accounts.get('mercadolibre')).toSnapshot()).toEqual({
      portal: 'mercadolibre',
      isEnabled: false,
      connection: {
        externalAccountId: '123456789',
        accountName: 'NORDEPROPIEDADES',
        connectedAt: new Date('2026-10-05T12:00:00Z'),
        connectedBy: ADMIN.id,
      },
    });
    const [row] = await db
      .select()
      .from(portalAccounts)
      .where(eq(portalAccounts.portal, 'mercadolibre'));
    expect(row?.isPaid).toBe(true);
    expect(row?.credentialsEncrypted?.toString('utf8')).not.toContain('APP_USR');
    expect(await credentials.read('mercadolibre')).toEqual({
      accessToken: 'APP_USR-access',
      refreshToken: 'TG-refresh',
      expiresAt: new Date('2026-10-05T18:00:00Z'),
    });

    const entries = await db.select().from(auditLog);
    expect(entries).toEqual([
      expect.objectContaining({
        action: 'portal_account.connected',
        entityType: 'portal_account',
        entityId: 'mercadolibre',
      }),
    ]);
  });

  it('rolls back when the account is already connected to the other portal', async () => {
    const { connect, accounts, credentials } = setup();
    unwrap(await connect.execute(CALLBACK, ADMIN));

    expect(
      unwrapErr(await connect.execute({ ...CALLBACK, portal: 'mercadolibre_developments' }, ADMIN))
        .type,
    ).toBe('PortalAccountInUse');
    expect((await accounts.get('mercadolibre_developments')).isConnected).toBe(false);
    expect(await credentials.read('mercadolibre_developments')).toBeUndefined();
  });

  it('disconnects an account and deletes its credentials', async () => {
    const { connect, disconnect, accounts, credentials } = setup();
    unwrap(await connect.execute(CALLBACK, ADMIN));

    unwrap(await disconnect.execute({ portal: 'mercadolibre' }, ADMIN));

    expect((await accounts.get('mercadolibre')).toSnapshot()).toEqual({
      portal: 'mercadolibre',
      isEnabled: false,
      connection: undefined,
    });
    expect(await credentials.read('mercadolibre')).toBeUndefined();
  });

  it('refuses to store credentials for an account that was never saved', async () => {
    const { credentials } = setup();
    await expect(
      credentials.save('mercadolibre', {
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: new Date('2026-10-05T18:00:00Z'),
      }),
    ).rejects.toThrow('must be saved first');
  });
});
