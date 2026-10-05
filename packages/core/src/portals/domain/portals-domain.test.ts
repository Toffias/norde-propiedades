import { describe, expect, it } from 'vitest';

import { unwrap, unwrapErr } from '../../shared/testing';

import { PORTAL_CATALOG, isPortalId, type PortalId } from './portal';
import { PortalAccount, type PortalConnection } from './portal-account';

const AT = new Date('2026-10-05T12:00:00Z');

function connection(externalAccountId: string, accountName = 'NORDEPROP'): PortalConnection {
  return { externalAccountId, accountName, connectedAt: AT, connectedBy: 'user-1' };
}

function connected(portal: PortalId, externalAccountId: string) {
  const account = PortalAccount.notConnected(portal);
  unwrap(account.connect(connection(externalAccountId), []));
  return account;
}

describe('portal catalog', () => {
  it('publishes properties and developments through separate MercadoLibre accounts', () => {
    expect(PORTAL_CATALOG.mercadolibre.publishes).toBe('property');
    expect(PORTAL_CATALOG.mercadolibre_developments.publishes).toBe('development');
  });

  it('recognizes only known portals', () => {
    expect(isPortalId('mercadolibre')).toBe(true);
    expect(isPortalId('zonaprop')).toBe(false);
  });
});

describe('PortalAccount', () => {
  it('starts disconnected and disabled', () => {
    const account = PortalAccount.notConnected('mercadolibre');
    expect(account.isConnected).toBe(false);
    expect(account.toSnapshot()).toEqual({
      portal: 'mercadolibre',
      isEnabled: false,
      connection: undefined,
    });
  });

  it('connects an account and keeps its data', () => {
    const account = PortalAccount.notConnected('mercadolibre');
    unwrap(account.connect(connection('123'), []));
    expect(account.toSnapshot().connection).toEqual(connection('123'));
  });

  it('replaces the previous account when it reconnects', () => {
    const account = connected('mercadolibre', '123');
    unwrap(account.connect(connection('456', 'OTRA'), []));
    expect(account.toSnapshot().connection?.externalAccountId).toBe('456');
  });

  it('rejects the account already connected to the other MercadoLibre account', () => {
    const properties = connected('mercadolibre', '123');
    const developments = PortalAccount.notConnected('mercadolibre_developments');

    expect(unwrapErr(developments.connect(connection('123'), [properties]))).toEqual({
      type: 'PortalAccountInUse',
      portal: 'mercadolibre',
    });
    expect(developments.isConnected).toBe(false);
  });

  it('ignores itself when it reconnects the same account', () => {
    const account = connected('mercadolibre', '123');
    unwrap(account.connect(connection('123'), [account]));
    expect(account.isConnected).toBe(true);
  });

  it('enables only a connected account', () => {
    const account = PortalAccount.notConnected('mercadolibre');
    expect(unwrapErr(account.enable())).toEqual({ type: 'PortalNotConnected' });

    unwrap(account.connect(connection('123'), []));
    unwrap(account.enable());
    expect(account.toSnapshot().isEnabled).toBe(true);

    account.disable();
    expect(account.toSnapshot().isEnabled).toBe(false);
  });

  it('disables the account when it disconnects', () => {
    const account = connected('mercadolibre', '123');
    unwrap(account.enable());

    unwrap(account.disconnect());

    expect(account.toSnapshot()).toEqual({
      portal: 'mercadolibre',
      isEnabled: false,
      connection: undefined,
    });
  });

  it('cannot disconnect an account that is not connected', () => {
    expect(unwrapErr(PortalAccount.notConnected('mercadolibre').disconnect())).toEqual({
      type: 'PortalNotConnected',
    });
  });
});
