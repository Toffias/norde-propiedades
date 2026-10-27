import { describe, expect, it } from 'vitest';

import { Actor } from '../../shared';
import { FixedClock, unwrap, unwrapErr } from '../../shared/testing';
import { Listing } from '../domain/listing';
import { PortalAccount } from '../domain/portal-account';
import { leadInquiry } from '../domain/portal-lead';
import {
  FakePortalLeadNotifications,
  FakePortalLeadSink,
  FakePortalLeadSource,
  FakePropertyCodeLookup,
  InMemoryPortalsUnitOfWork,
  LISTED_PROPERTY_ID,
  portalLead,
} from '../testing';
import { EnablePortalLeadNotifications } from './commands/enable-portal-lead-notifications';
import { NotifyPortalLeads } from './commands/notify-portal-leads';
import { PullPortalLeads } from './commands/pull-portal-leads';
import { parseId } from '../../shared';

// Consultas que llegan por los avisos de Zonaprop a la bandeja.

const PORTAL_SYNC = Actor.system('portal-sync', ['portals:sync']);
const MANAGER = Actor.user('admin-1', ['portals:*']);
const PUBLISHER = Actor.user('agent-1', ['portals:manage', 'portals:publish']);
const NOW = '2026-10-16T12:00:00.000Z';
const TARGET = {
  url: 'https://gestion.norde.test/api/webhooks/portals/zonaprop',
  headerName: 'x-norde-token',
  headerValue: 'a'.repeat(40),
};

function zonapropAccount() {
  const account = PortalAccount.notConnected('zonaprop');
  unwrap(
    account.connect(
      {
        externalAccountId: '17310373',
        accountName: 'Norde Propiedades',
        connectedAt: new Date(NOW),
        connectedBy: 'admin-1',
      },
      [],
      false,
    ),
  );
  return account.toSnapshot();
}

const DAY = 24 * 60 * 60 * 1000;

function setup() {
  const uow = new InMemoryPortalsUnitOfWork();
  uow.accounts.rows.set('zonaprop', zonapropAccount());
  const source = new FakePortalLeadSource();
  const sink = new FakePortalLeadSink();
  const notifications = new FakePortalLeadNotifications();
  const clock = new FixedClock(NOW);
  const properties = new FakePropertyCodeLookup();
  return {
    uow,
    source,
    sink,
    clock,
    properties,
    notifications,
    pull: new PullPortalLeads({ uow, source, sink, properties, clock }),
    notify: new NotifyPortalLeads({ uow, clock }),
    enable: new EnablePortalLeadNotifications({ uow, notifications, target: TARGET }),
  };
}

describe('leadInquiry', () => {
  it('keeps the contact data and the message', () => {
    expect(leadInquiry(portalLead())).toEqual({
      externalId: '236161673',
      receivedAt: new Date('2026-10-16T11:30:00Z'),
      name: 'Juli',
      email: 'juli@example.test',
      phone: '+5491165889654',
      message: 'Hola, me interesa esta propiedad.',
    });
  });

  it('says what the person asked for when there is no message', () => {
    expect(leadInquiry(portalLead({ kind: 'call_me', message: undefined }))?.message).toBe(
      'Pidió que lo llamen.',
    );
    expect(leadInquiry(portalLead({ kind: 'whatsapp', message: '  ' }))?.message).toBe(
      'Quiso ver el WhatsApp de la inmobiliaria.',
    );
  });

  it('leaves out an anonymous contact without phone or email', () => {
    expect(
      leadInquiry(
        portalLead({ name: 'ANONYMOUS', email: '–', phone: undefined, kind: 'contact_data' }),
      ),
    ).toBeUndefined();
  });

  it('drops the placeholders the portal sends instead of a name', () => {
    expect(leadInquiry(portalLead({ name: 'ANONYMOUS' }))?.name).toBeUndefined();
  });
});

describe('PullPortalLeads', () => {
  it('brings the contacts of the last two days to the inbox, once', async () => {
    const { pull, source, sink } = setup();

    expect(unwrap(await pull.execute({ portal: 'zonaprop' }, PORTAL_SYNC))).toEqual({
      received: 1,
      duplicates: 0,
      skipped: 0,
      rejected: 0,
      rejections: [],
    });
    expect(source.calls).toEqual([
      { since: new Date('2026-10-14T12:00:00.000Z'), offset: 0, limit: 100, asksReceived: true },
    ]);
    expect(sink.received).toEqual([
      expect.objectContaining({
        channel: 'zonaprop',
        externalId: '236161673',
        email: 'juli@example.test',
        propertyId: undefined,
      }),
    ]);

    expect(unwrap(await pull.execute({ portal: 'zonaprop' }, PORTAL_SYNC))).toMatchObject({
      received: 0,
      duplicates: 1,
    });
  });

  it('links the inquiry to the property of a Norde listing', async () => {
    const { pull, source, sink, uow } = setup();
    const id = parseId<'Listing'>('01920000-0000-7000-8000-00000000a001');
    if (id.isErr()) throw new Error('bad id');
    const listing = Listing.linked({
      id: id.value,
      portal: 'zonaprop',
      owner: { kind: 'property', id: LISTED_PROPERTY_ID },
      operation: undefined,
      plan: 'SIMPLE',
      externalId: '0192000000007000800000000000a001',
      permalink: undefined,
      contentHash: 'h',
      now: new Date(NOW),
    });
    uow.listings.rows.set(listing.id, listing.toSnapshot());
    source.leads = [
      portalLead({ listingCode: '0192000000007000800000000000a001' }),
      portalLead({ externalId: '2', listingCode: 'PRO3621230' }),
    ];

    unwrap(await pull.execute({ portal: 'zonaprop' }, PORTAL_SYNC));

    expect(sink.received.map((r) => r.propertyId)).toEqual([LISTED_PROPERTY_ID, undefined]);
  });

  it('links the inquiry of a listing Norde does not manage yet by its internal key', async () => {
    const { pull, source, sink, properties } = setup();
    source.leads = [
      portalLead({ listingCode: 'TOKKO-1', listingReference: 'NHO1142594' }),
      portalLead({ externalId: '2', listingCode: 'TOKKO-2', listingReference: 'NCO1 NHO1142594' }),
      portalLead({ externalId: '3', listingCode: 'TOKKO-3', listingReference: 'OTRO' }),
    ];

    unwrap(await pull.execute({ portal: 'zonaprop' }, PORTAL_SYNC));

    expect(sink.received.map((r) => r.propertyId)).toEqual([
      LISTED_PROPERTY_ID,
      LISTED_PROPERTY_ID,
      undefined,
    ]);
    expect(properties.calls).toEqual([['NHO1142594', 'NCO1 NHO1142594', 'OTRO']]);
  });

  it('links the inquiry to the development of its listing, or to the unit it came from', async () => {
    const { pull, source, sink, uow } = setup();
    const id = parseId<'Listing'>('01920000-0000-7000-8000-00000000a002');
    if (id.isErr()) throw new Error('bad id');
    const developmentId = '01920000-0000-7000-8000-0000000000d1';
    const unitId = '01920000-0000-7000-8000-0000000000c1';
    const listing = Listing.linked({
      id: id.value,
      portal: 'zonaprop',
      owner: { kind: 'development', id: developmentId },
      operation: undefined,
      plan: 'DESARROLLOS_HOME',
      externalId: '0192000000007000800000000000a002',
      permalink: undefined,
      contentHash: 'h',
      now: new Date(NOW),
    });
    uow.listings.rows.set(listing.id, listing.toSnapshot());
    source.leads = [
      portalLead({ listingCode: '0192000000007000800000000000a002' }),
      portalLead({ externalId: '2', listingCode: 'U01920000', unitPropertyId: unitId }),
    ];

    unwrap(await pull.execute({ portal: 'zonaprop' }, PORTAL_SYNC));

    expect(sink.received.map((r) => [r.propertyId, r.developmentId])).toEqual([
      [undefined, developmentId],
      [unitId, undefined],
    ]);
  });

  it('counts the contacts without data and the ones the inbox rejects', async () => {
    const { pull, source, sink } = setup();
    source.leads = [portalLead({ email: undefined, phone: undefined })];
    expect(unwrap(await pull.execute({ portal: 'zonaprop' }, PORTAL_SYNC))).toMatchObject({
      skipped: 1,
      received: 0,
    });

    source.leads = [portalLead()];
    sink.rejectWith = { type: 'PortalLeadRejected', reason: 'InvalidPhone' };
    expect(unwrap(await pull.execute({ portal: 'zonaprop' }, PORTAL_SYNC))).toMatchObject({
      rejected: 1,
      rejections: [{ externalId: '236161673', reason: 'InvalidPhone' }],
    });
  });

  it('reads from the last complete pull after an outage, up to two weeks back', async () => {
    const { pull, source, uow, clock } = setup();
    unwrap(await pull.execute({ portal: 'zonaprop' }, PORTAL_SYNC));
    expect(uow.accounts.rows.get('zonaprop')?.leadsPulledAt).toEqual(new Date(NOW));

    clock.advance(5 * DAY);
    unwrap(await pull.execute({ portal: 'zonaprop' }, PORTAL_SYNC));
    clock.advance(40 * DAY);
    unwrap(await pull.execute({ portal: 'zonaprop' }, PORTAL_SYNC));

    expect(source.calls.map((c) => c.since)).toEqual([
      new Date('2026-10-14T12:00:00.000Z'),
      new Date(NOW),
      new Date('2026-11-16T12:00:00.000Z'),
    ]);
  });

  it('keeps the cursor when the portal fails', async () => {
    const { pull, source, uow } = setup();
    source.failWith = { type: 'PortalUnavailable' };
    unwrapErr(await pull.execute({ portal: 'zonaprop' }, PORTAL_SYNC));
    expect(uow.accounts.rows.get('zonaprop')?.leadsPulledAt).toBeUndefined();
  });

  it('reads every page', async () => {
    const { pull, source, sink } = setup();
    source.leads = Array.from({ length: 150 }, (_, i) => portalLead({ externalId: String(i) }));

    unwrap(await pull.execute({ portal: 'zonaprop' }, PORTAL_SYNC));

    expect(source.calls.map((c) => c.offset)).toEqual([0, 100]);
    expect(sink.received).toHaveLength(150);
  });

  it('lets the portal skip the details of the contacts the inbox already has', async () => {
    const { pull, source, sink } = setup();
    source.leads = [portalLead({ externalId: 'a' })];
    unwrap(await pull.execute({ portal: 'zonaprop' }, PORTAL_SYNC));
    expect(source.calls.every((c) => c.asksReceived)).toBe(true);
    expect([...(await sink.known('zonaprop', ['a', 'b']))]).toEqual(['a']);
  });

  it('pages by what the portal pages, not by the contacts it returned', async () => {
    const { pull, source, sink } = setup();
    // 150 interesados con dos contactos cada uno: más contactos que interesados.
    source.groups = Array.from({ length: 150 }, (_, i) => [
      portalLead({ externalId: `${String(i)}-a` }),
      portalLead({ externalId: `${String(i)}-b` }),
    ]);

    unwrap(await pull.execute({ portal: 'zonaprop' }, PORTAL_SYNC));

    expect(source.calls.map((c) => c.offset)).toEqual([0, 100]);
    expect(sink.received).toHaveLength(300);
  });

  it('keeps reading past interested people without contacts, and counts them', async () => {
    const { pull, source, sink } = setup();
    source.groups = Array.from({ length: 120 }, (_, i) =>
      i % 2 === 0 ? [] : [portalLead({ externalId: String(i) })],
    );

    const outcome = unwrap(await pull.execute({ portal: 'zonaprop' }, PORTAL_SYNC));

    expect(source.calls.map((c) => c.offset)).toEqual([0, 100]);
    expect(sink.received).toHaveLength(60);
    expect(outcome).toMatchObject({ received: 60, skipped: 60 });
  });

  it('does nothing without a connected account or on a portal without leads', async () => {
    const { pull, source, uow } = setup();
    expect(unwrap(await pull.execute({ portal: 'mercadolibre' }, PORTAL_SYNC))).toMatchObject({
      received: 0,
    });
    uow.accounts.rows.delete('zonaprop');
    expect(unwrap(await pull.execute({ portal: 'zonaprop' }, PORTAL_SYNC))).toMatchObject({
      received: 0,
    });
    expect(source.calls).toEqual([]);
  });

  it('returns the portal error so the job retries', async () => {
    const { pull, source } = setup();
    source.failWith = { type: 'PortalUnavailable' };
    expect(unwrapErr(await pull.execute({ portal: 'zonaprop' }, PORTAL_SYNC))).toEqual({
      type: 'PortalUnavailable',
    });
  });

  it('requires portals:sync', async () => {
    const { pull } = setup();
    expect(unwrapErr(await pull.execute({ portal: 'zonaprop' }, PUBLISHER))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('NotifyPortalLeads', () => {
  it('asks the job to read the contacts, through the outbox', async () => {
    const { notify, uow } = setup();

    unwrap(await notify.execute({ portal: 'zonaprop' }, PORTAL_SYNC));

    expect(uow.events.published).toEqual([
      expect.objectContaining({
        type: 'portals.leads_arrived',
        aggregateId: 'zonaprop',
        payload: { portal: 'zonaprop' },
      }),
    ]);
  });

  it('requires portals:sync', async () => {
    const { notify } = setup();
    expect(unwrapErr(await notify.execute({ portal: 'zonaprop' }, PUBLISHER))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('EnablePortalLeadNotifications', () => {
  it('subscribes the portal and audits it without the header value', async () => {
    const { enable, notifications, uow } = setup();

    unwrap(await enable.execute({ portal: 'zonaprop' }, MANAGER));

    expect(notifications.subscriptions).toEqual([{ portal: 'zonaprop', ...TARGET }]);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'portal_account.lead_notifications_enabled',
        entityId: 'zonaprop',
        changes: {
          notifications: { before: null, after: { url: TARGET.url, header: 'x-norde-token' } },
        },
      }),
    ]);
    expect(JSON.stringify(uow.audit.entries)).not.toContain(TARGET.headerValue);
  });

  it('is not configured without the server URL and token', async () => {
    const { uow, notifications } = setup();
    const enable = new EnablePortalLeadNotifications({ uow, notifications, target: undefined });
    expect(unwrapErr(await enable.execute({ portal: 'zonaprop' }, MANAGER))).toEqual({
      type: 'PortalNotConfigured',
    });
  });

  it('needs a connected account and portals:manage', async () => {
    const { enable, uow } = setup();
    expect(
      unwrapErr(await enable.execute({ portal: 'zonaprop' }, Actor.user('x', ['portals:publish']))),
    ).toEqual({ type: 'Forbidden' });
    uow.accounts.rows.delete('zonaprop');
    expect(unwrapErr(await enable.execute({ portal: 'zonaprop' }, MANAGER))).toEqual({
      type: 'PortalNotConnected',
    });
  });

  it('returns the portal error', async () => {
    const { enable, notifications, uow } = setup();
    notifications.failWith = { type: 'PortalUnavailable' };
    expect(unwrapErr(await enable.execute({ portal: 'zonaprop' }, MANAGER))).toEqual({
      type: 'PortalUnavailable',
    });
    expect(uow.audit.entries).toHaveLength(0);
  });
});
