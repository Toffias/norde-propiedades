import { describe, expect, it } from 'vitest';

import { Actor } from '../../shared';
import { FixedClock, unwrap, unwrapErr } from '../../shared/testing';
import { FakePortalAuthorizer, InMemoryPortalsUnitOfWork } from '../testing';
import { ConnectPortalAccount } from './commands/connect-portal-account';
import { DisconnectPortalAccount } from './commands/disconnect-portal-account';
import { SetPortalAccountEnabled } from './commands/set-portal-account-enabled';
import { StartPortalConnection } from './commands/start-portal-connection';
import { ListPortalAccounts } from './queries/list-portal-accounts';

const ADMIN = Actor.user('admin-1', ['portals:*']);
const PUBLISHER = Actor.user('agent-1', ['portals:publish']);
const NOBODY = Actor.user('agent-2', ['properties:read']);
const NOW = '2026-10-05T12:00:00.000Z';

function setup() {
  const uow = new InMemoryPortalsUnitOfWork();
  const authorizer = new FakePortalAuthorizer();
  const clock = new FixedClock(NOW);
  return {
    uow,
    authorizer,
    start: new StartPortalConnection({ authorizer }),
    connect: new ConnectPortalAccount({ uow, authorizer, clock }),
    disconnect: new DisconnectPortalAccount({ uow }),
    setEnabled: new SetPortalAccountEnabled({ uow }),
    list: new ListPortalAccounts({ accounts: uow.accounts }),
  };
}

const CALLBACK = {
  portal: 'mercadolibre',
  code: 'TG-code',
  state: 'state-1',
  expectedState: 'state-1',
  codeVerifier: 'v'.repeat(43),
} as const;

async function connected(portal: 'mercadolibre' | 'mercadolibre_developments' = 'mercadolibre') {
  const s = setup();
  unwrap(await s.connect.execute({ ...CALLBACK, portal }, ADMIN));
  return s;
}

describe('StartPortalConnection', () => {
  it('returns the URL where the user authorizes Norde', async () => {
    const { start } = setup();
    const request = unwrap(await start.execute({ portal: 'mercadolibre' }, ADMIN));
    expect(request.url).toContain('portal=mercadolibre');
    expect(request.state).toBe('state-1');
  });

  it('fails when the portal app is not configured', async () => {
    const { start, authorizer } = setup();
    authorizer.notConfigured = true;
    expect(unwrapErr(await start.execute({ portal: 'mercadolibre' }, ADMIN))).toEqual({
      type: 'PortalNotConfigured',
    });
  });

  it('requires portals:manage', async () => {
    const { start } = setup();
    expect(unwrapErr(await start.execute({ portal: 'mercadolibre' }, PUBLISHER))).toEqual({
      type: 'Forbidden',
    });
  });

  it('rejects an unknown portal', async () => {
    const { start } = setup();
    expect(unwrapErr(await start.execute({ portal: 'zonaprop' as never }, ADMIN)).type).toBe(
      'ValidationFailed',
    );
  });
});

describe('ConnectPortalAccount', () => {
  it('links the account, stores the credentials and audits it', async () => {
    const { connect, uow, authorizer } = setup();

    const result = unwrap(await connect.execute(CALLBACK, ADMIN));

    expect(result).toEqual({ accountName: 'NORDEPROPIEDADES' });
    expect(authorizer.completed).toEqual([
      { portal: 'mercadolibre', code: 'TG-code', codeVerifier: 'v'.repeat(43) },
    ]);
    expect(uow.accounts.rows.get('mercadolibre')).toEqual({
      portal: 'mercadolibre',
      isEnabled: false,
      connection: {
        externalAccountId: '123456789',
        accountName: 'NORDEPROPIEDADES',
        connectedAt: new Date(NOW),
        connectedBy: 'admin-1',
      },
    });
    expect(uow.credentials.stored.get('mercadolibre')?.refreshToken).toBe('TG-refresh');
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'action',
        action: 'portal_account.connected',
        entityType: 'portal_account',
        entityId: 'mercadolibre',
        actorId: 'admin-1',
        clientIds: [],
        changes: {
          account: {
            before: null,
            after: { externalAccountId: '123456789', accountName: 'NORDEPROPIEDADES' },
          },
        },
      }),
    ]);
    // Los tokens nunca van a la auditoría.
    expect(JSON.stringify(uow.audit.entries)).not.toContain('APP_USR');
  });

  it('rejects a state that does not match the one saved at the start', async () => {
    const { connect, uow, authorizer } = setup();
    expect(unwrapErr(await connect.execute({ ...CALLBACK, state: 'other' }, ADMIN))).toEqual({
      type: 'InvalidAuthorizationState',
    });
    expect(authorizer.completed).toHaveLength(0);
    expect(uow.accounts.rows.size).toBe(0);
  });

  it('returns the portal error and saves nothing when the code is rejected', async () => {
    const { connect, uow, authorizer } = setup();
    authorizer.failWith = { type: 'PortalAuthorizationRejected', reason: 'invalid_grant' };

    expect(unwrapErr(await connect.execute(CALLBACK, ADMIN))).toEqual({
      type: 'PortalAuthorizationRejected',
      reason: 'invalid_grant',
    });
    expect(uow.credentials.stored.size).toBe(0);
    expect(uow.audit.entries).toHaveLength(0);
  });

  it('rejects the account already connected to the other MercadoLibre account', async () => {
    const { connect, uow } = await connected('mercadolibre');

    expect(
      unwrapErr(await connect.execute({ ...CALLBACK, portal: 'mercadolibre_developments' }, ADMIN)),
    ).toEqual({ type: 'PortalAccountInUse', portal: 'mercadolibre' });
    expect(uow.accounts.rows.has('mercadolibre_developments')).toBe(false);
    expect(uow.credentials.stored.has('mercadolibre_developments')).toBe(false);
  });

  it('audits the previous account when it reconnects another one', async () => {
    const { connect, uow, authorizer } = await connected();
    authorizer.grant = { ...authorizer.grant, externalAccountId: '999', accountName: 'NUEVA' };

    unwrap(await connect.execute(CALLBACK, ADMIN));

    expect(uow.audit.entries.at(-1)?.changes).toEqual({
      account: {
        before: { externalAccountId: '123456789', accountName: 'NORDEPROPIEDADES' },
        after: { externalAccountId: '999', accountName: 'NUEVA' },
      },
    });
  });

  it('requires portals:manage', async () => {
    const { connect, authorizer } = setup();
    expect(unwrapErr(await connect.execute(CALLBACK, PUBLISHER))).toEqual({ type: 'Forbidden' });
    expect(authorizer.completed).toHaveLength(0);
  });
});

describe('DisconnectPortalAccount', () => {
  it('unlinks the account, deletes the credentials and audits it', async () => {
    const { disconnect, setEnabled, uow } = await connected();
    unwrap(await setEnabled.execute({ portal: 'mercadolibre', enabled: true }, ADMIN));

    unwrap(await disconnect.execute({ portal: 'mercadolibre' }, ADMIN));

    expect(uow.accounts.rows.get('mercadolibre')).toEqual({
      portal: 'mercadolibre',
      isEnabled: false,
      connection: undefined,
    });
    expect(uow.credentials.stored.has('mercadolibre')).toBe(false);
    expect(uow.audit.entries.at(-1)).toMatchObject({
      action: 'portal_account.disconnected',
      entityId: 'mercadolibre',
      changes: {
        account: {
          before: { externalAccountId: '123456789', accountName: 'NORDEPROPIEDADES' },
          after: null,
        },
      },
    });
  });

  it('fails when the account is not connected', async () => {
    const { disconnect, uow } = setup();
    expect(unwrapErr(await disconnect.execute({ portal: 'mercadolibre' }, ADMIN))).toEqual({
      type: 'PortalNotConnected',
    });
    expect(uow.audit.entries).toHaveLength(0);
  });

  it('requires portals:manage', async () => {
    const { disconnect } = await connected();
    expect(unwrapErr(await disconnect.execute({ portal: 'mercadolibre' }, PUBLISHER))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('SetPortalAccountEnabled', () => {
  it('enables a connected account and audits the change', async () => {
    const { setEnabled, uow } = await connected();

    unwrap(await setEnabled.execute({ portal: 'mercadolibre', enabled: true }, ADMIN));

    expect(uow.accounts.rows.get('mercadolibre')?.isEnabled).toBe(true);
    expect(uow.audit.entries.at(-1)).toMatchObject({
      action: 'portal_account.enabled',
      changes: { isEnabled: { before: false, after: true } },
    });
  });

  it('disables an account', async () => {
    const { setEnabled, uow } = await connected();
    unwrap(await setEnabled.execute({ portal: 'mercadolibre', enabled: true }, ADMIN));

    unwrap(await setEnabled.execute({ portal: 'mercadolibre', enabled: false }, ADMIN));

    expect(uow.accounts.rows.get('mercadolibre')?.isEnabled).toBe(false);
    expect(uow.audit.entries.at(-1)?.action).toBe('portal_account.disabled');
  });

  it('does not audit when nothing changes', async () => {
    const { setEnabled, uow } = await connected();
    const before = uow.audit.entries.length;
    unwrap(await setEnabled.execute({ portal: 'mercadolibre', enabled: false }, ADMIN));
    expect(uow.audit.entries).toHaveLength(before);
  });

  it('cannot enable an account that is not connected', async () => {
    const { setEnabled } = setup();
    expect(
      unwrapErr(await setEnabled.execute({ portal: 'mercadolibre', enabled: true }, ADMIN)),
    ).toEqual({ type: 'PortalNotConnected' });
  });

  it('requires portals:manage', async () => {
    const { setEnabled } = await connected();
    expect(
      unwrapErr(await setEnabled.execute({ portal: 'mercadolibre', enabled: true }, PUBLISHER)),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('ListPortalAccounts', () => {
  it('lists every account of the catalog with its connection', async () => {
    const { list } = await connected();

    expect(unwrap(await list.execute({}, ADMIN))).toEqual({
      canManage: true,
      accounts: [
        {
          portal: 'mercadolibre',
          publishes: 'property',
          paid: true,
          isEnabled: false,
          isConnected: true,
          accountName: 'NORDEPROPIEDADES',
          connectedAt: new Date(NOW),
        },
        {
          portal: 'mercadolibre_developments',
          publishes: 'development',
          paid: true,
          isEnabled: false,
          isConnected: false,
          accountName: undefined,
          connectedAt: undefined,
        },
      ],
    });
  });

  it('lets publishers see the accounts without managing them', async () => {
    const { list } = setup();
    expect(unwrap(await list.execute({}, PUBLISHER)).canManage).toBe(false);
  });

  it('requires a portals permission', async () => {
    const { list } = setup();
    expect(unwrapErr(await list.execute({}, NOBODY))).toEqual({ type: 'Forbidden' });
  });
});
