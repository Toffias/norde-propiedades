import { describe, expect, it } from 'vitest';

import { Actor } from '../../shared';
import { FixedClock, unwrap, unwrapErr } from '../../shared/testing';
import { FakePortalAccountDirectory, InMemoryPortalsUnitOfWork } from '../testing';
import { ConnectPortalAccountWithCode } from './commands/connect-portal-account-with-code';
import { DisconnectPortalAccount } from './commands/disconnect-portal-account';
import { GetPortalCredits } from './queries/get-portal-credits';

const ADMIN = Actor.user('admin-1', ['portals:*']);
const PUBLISHER = Actor.user('agent-1', ['portals:publish']);
const NOBODY = Actor.user('agent-2', ['properties:read']);
const NOW = '2026-10-16T12:00:00.000Z';
const INPUT = { portal: 'zonaprop', accountCode: ' 17310373 ' } as const;

function setup() {
  const uow = new InMemoryPortalsUnitOfWork();
  const directory = new FakePortalAccountDirectory();
  return {
    uow,
    directory,
    connect: new ConnectPortalAccountWithCode({ uow, directory, clock: new FixedClock(NOW) }),
    disconnect: new DisconnectPortalAccount({ uow }),
    credits: new GetPortalCredits({ accounts: uow.accounts, directory }),
  };
}

async function connected() {
  const s = setup();
  unwrap(await s.connect.execute(INPUT, ADMIN));
  return s;
}

describe('ConnectPortalAccountWithCode', () => {
  it('links the account the portal finds by its code and audits it', async () => {
    const { connect, uow, directory } = setup();

    expect(unwrap(await connect.execute(INPUT, ADMIN))).toEqual({
      accountName: 'Norde Propiedades',
    });

    expect(directory.lookups).toEqual([{ portal: 'zonaprop', accountCode: '17310373' }]);
    expect(uow.accounts.rows.get('zonaprop')).toEqual({
      portal: 'zonaprop',
      isEnabled: false,
      connection: {
        externalAccountId: '17310373',
        accountName: 'Norde Propiedades',
        connectedAt: new Date(NOW),
        connectedBy: 'admin-1',
      },
    });
    // Las credenciales de integrador son de Norde: no se guardan por cuenta.
    expect(uow.credentials.stored.size).toBe(0);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'action',
        action: 'portal_account.connected',
        entityType: 'portal_account',
        entityId: 'zonaprop',
        actorId: 'admin-1',
        clientIds: [],
        changes: {
          account: {
            before: null,
            after: { externalAccountId: '17310373', accountName: 'Norde Propiedades' },
          },
        },
      }),
    ]);
  });

  it('audits the previous account when it reconnects with another code', async () => {
    const { connect, uow, directory } = await connected();
    directory.accounts.set('999', { externalAccountId: '999', accountName: 'Norde Sucursal' });

    unwrap(await connect.execute({ portal: 'zonaprop', accountCode: '999' }, ADMIN));

    expect(uow.audit.entries[1]?.changes).toEqual({
      account: {
        before: { externalAccountId: '17310373', accountName: 'Norde Propiedades' },
        after: { externalAccountId: '999', accountName: 'Norde Sucursal' },
      },
    });
  });

  it('returns the portal error and saves nothing when the code is not found', async () => {
    const { connect, uow } = setup();

    expect(
      unwrapErr(await connect.execute({ portal: 'zonaprop', accountCode: '1' }, ADMIN)),
    ).toEqual({ type: 'PortalAccountNotFound' });
    expect(uow.accounts.rows.size).toBe(0);
    expect(uow.audit.entries).toHaveLength(0);
  });

  it.each([
    { type: 'PortalAccountBlocked' },
    { type: 'PortalNotConfigured' },
    { type: 'PortalUnavailable' },
  ] as const)('returns $type from the portal', async (error) => {
    const { connect, uow, directory } = setup();
    directory.failWith = error;

    expect(unwrapErr(await connect.execute(INPUT, ADMIN))).toEqual(error);
    expect(uow.accounts.rows.size).toBe(0);
  });

  it('rejects a portal that is connected by OAuth', async () => {
    const { connect, directory } = setup();
    expect(
      unwrapErr(await connect.execute({ portal: 'mercadolibre', accountCode: '123' }, ADMIN)),
    ).toEqual({ type: 'WrongConnectionMethod' });
    expect(directory.lookups).toHaveLength(0);
  });

  it('rejects an empty code', async () => {
    const { connect, directory } = setup();
    expect(
      unwrapErr(await connect.execute({ portal: 'zonaprop', accountCode: '  ' }, ADMIN)).type,
    ).toBe('ValidationFailed');
    expect(directory.lookups).toHaveLength(0);
  });

  it('requires portals:manage', async () => {
    const { connect, directory } = setup();
    expect(unwrapErr(await connect.execute(INPUT, PUBLISHER))).toEqual({ type: 'Forbidden' });
    expect(directory.lookups).toHaveLength(0);
  });

  it('disconnects like any other account', async () => {
    const { disconnect, uow } = await connected();

    unwrap(await disconnect.execute({ portal: 'zonaprop' }, ADMIN));

    expect(uow.accounts.rows.get('zonaprop')?.connection).toBeUndefined();
    expect(uow.audit.entries.at(-1)).toEqual(
      expect.objectContaining({
        action: 'portal_account.disconnected',
        entityId: 'zonaprop',
        changes: {
          account: {
            before: { externalAccountId: '17310373', accountName: 'Norde Propiedades' },
            after: null,
          },
        },
      }),
    );
  });
});

describe('GetPortalCredits', () => {
  it('reads the credits of the connected account from the portal', async () => {
    const { credits, directory } = await connected();

    expect(unwrap(await credits.execute({ portal: 'zonaprop' }, PUBLISHER))).toEqual([
      { plan: 'SIMPLE', available: 40, contracted: 50 },
      { plan: 'DESTACADO', available: 3, contracted: 5 },
    ]);
    expect(directory.creditReads).toEqual([{ portal: 'zonaprop', externalAccountId: '17310373' }]);
  });

  it('needs a connected account', async () => {
    const { credits, directory } = setup();
    expect(unwrapErr(await credits.execute({ portal: 'zonaprop' }, ADMIN))).toEqual({
      type: 'PortalNotConnected',
    });
    expect(directory.creditReads).toHaveLength(0);
  });

  it('returns the portal error', async () => {
    const { credits, directory } = await connected();
    directory.creditsFailWith = { type: 'PortalUnavailable' };
    expect(unwrapErr(await credits.execute({ portal: 'zonaprop' }, ADMIN))).toEqual({
      type: 'PortalUnavailable',
    });
  });

  it('only reads portals connected by their account code', async () => {
    const { credits } = setup();
    expect(unwrapErr(await credits.execute({ portal: 'mercadolibre' }, ADMIN))).toEqual({
      type: 'WrongConnectionMethod',
    });
  });

  it('requires a portals permission', async () => {
    const { credits } = await connected();
    expect(unwrapErr(await credits.execute({ portal: 'zonaprop' }, NOBODY))).toEqual({
      type: 'Forbidden',
    });
  });
});
