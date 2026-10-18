import { describe, expect, it } from 'vitest';

import { Actor } from '../../shared';
import { FixedClock, unwrap, unwrapErr } from '../../shared/testing';
import type { PortalId } from '../domain/portal';
import { PortalAccount } from '../domain/portal-account';
import {
  FakePortalLeadNotifications,
  FakePortalLeadSink,
  FakePortalLeadSource,
  InMemoryPortalsUnitOfWork,
  portalLead,
} from '../testing';
import { EnablePortalLeadNotifications } from './commands/enable-portal-lead-notifications';
import { NotifyAccountLeads } from './commands/notify-account-leads';
import { PullPortalLeads } from './commands/pull-portal-leads';

// Consultas que llegan por los avisos de las dos cuentas de MercadoLibre a la bandeja.

const PORTAL_SYNC = Actor.system('portal-sync', ['portals:sync']);
const MANAGER = Actor.user('admin-1', ['portals:*']);
const NOW = '2026-10-18T12:00:00.000Z';

function connect(uow: InMemoryPortalsUnitOfWork, portal: PortalId, externalAccountId: string) {
  const account = PortalAccount.notConnected(portal);
  unwrap(
    account.connect(
      { externalAccountId, accountName: 'NORDE', connectedAt: new Date(NOW), connectedBy: 'u' },
      [],
    ),
  );
  uow.accounts.rows.set(portal, account.toSnapshot());
}

function setup() {
  const uow = new InMemoryPortalsUnitOfWork();
  connect(uow, 'mercadolibre', '3773207548');
  connect(uow, 'mercadolibre_developments', '3773207549');
  connect(uow, 'zonaprop', '3773207548');
  const clock = new FixedClock(NOW);
  return { uow, clock, notify: new NotifyAccountLeads({ uow, clock }) };
}

describe('NotifyAccountLeads', () => {
  it('asks to pull the leads of the MercadoLibre account the notice is about', async () => {
    const { uow, notify } = setup();

    const notified = unwrap(
      await notify.execute(
        { provider: 'mercadolibre', externalAccountId: '3773207549' },
        PORTAL_SYNC,
      ),
    );

    expect(notified).toEqual({ portal: 'mercadolibre_developments' });
    expect(uow.events.published).toEqual([
      expect.objectContaining({
        type: 'portals.leads_arrived',
        payload: { portal: 'mercadolibre_developments' },
      }),
    ]);
  });

  it('ignores a notice about an account Norde has not connected', async () => {
    const { uow, notify } = setup();
    expect(
      unwrap(
        await notify.execute({ provider: 'mercadolibre', externalAccountId: '999' }, PORTAL_SYNC),
      ),
    ).toEqual({ portal: undefined });
    expect(uow.events.published).toEqual([]);
  });

  it('rejects an invalid notice', async () => {
    const { notify } = setup();
    expect(
      unwrapErr(
        await notify.execute({ provider: 'mercadolibre', externalAccountId: ' ' }, PORTAL_SYNC),
      ).type,
    ).toBe('ValidationFailed');
  });

  it('requires portals:sync', async () => {
    const { notify } = setup();
    expect(
      unwrapErr(
        await notify.execute(
          { provider: 'mercadolibre', externalAccountId: '3773207548' },
          Actor.user('agent-1', ['portals:publish']),
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('PullPortalLeads on MercadoLibre', () => {
  it('brings the leads of the account to the inbox with the mercadolibre channel', async () => {
    const { uow, clock } = setup();
    const source = new FakePortalLeadSource();
    source.leads = [portalLead({ externalId: '6b4aebf8-5570-47b8-9224-c1c177621575' })];
    const sink = new FakePortalLeadSink();
    const pull = new PullPortalLeads({ uow, source, sink, clock });

    const outcome = unwrap(await pull.execute({ portal: 'mercadolibre' }, PORTAL_SYNC));

    expect(outcome.received).toBe(1);
    expect(sink.received[0]).toMatchObject({
      channel: 'mercadolibre',
      externalId: '6b4aebf8-5570-47b8-9224-c1c177621575',
    });
  });
});

describe('EnablePortalLeadNotifications on MercadoLibre', () => {
  it('is configured in the MercadoLibre app, not through the API', async () => {
    const { uow } = setup();
    const enable = new EnablePortalLeadNotifications({
      uow,
      notifications: new FakePortalLeadNotifications(),
      target: { url: 'https://norde.test/hook', headerName: 'x-norde-token', headerValue: 'x' },
    });

    expect(unwrapErr(await enable.execute({ portal: 'mercadolibre' }, MANAGER))).toEqual({
      type: 'WrongConnectionMethod',
    });
  });
});
