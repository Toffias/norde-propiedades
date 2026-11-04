import { describe, expect, it } from 'vitest';

import { InMemoryCompanySettingsRepository, RecordingMailer } from '../../../settings/testing';
import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import { MAX_SAVED_SEARCHES_PER_CLIENT } from '../../domain/saved-search';
import {
  FakeSharedListingTokens,
  FakeSubscriptionConfirmationEmails,
  InMemoryClientsUnitOfWork,
  InMemoryDefaultAssignee,
  seedClient,
  seedSavedSearch,
} from '../../testing';
import { PurgeExpiredSearchSubscriptions } from '../handlers/purge-expired-search-subscriptions';
import { GetSearchSubscription } from '../queries/get-search-subscription';

import { ConfirmSearchSubscription } from './confirm-search-subscription';
import {
  RequestSearchSubscription,
  type RequestSearchSubscriptionError,
} from './request-search-subscription';

const SITE = 'https://norde.com.ar';
const WEB = Actor.system('web', ['clients:subscribe-searches']);
const JOBS = Actor.system('scheduler', ['clients:send-follow-ups']);
const LOCATION_ID = '00000000-0000-7000-8000-0000000000c1';
const DEFAULT_AGENT = { userId: 'user-camila', branchId: 'branch-centro' };
const HOUR = 60 * 60 * 1000;

const REQUEST = {
  name: '  Ana   Pérez ',
  email: 'Ana@Example.com',
  frequency: 'weekly' as const,
  summary: 'Departamentos en venta en Palermo',
  operation: 'sale' as const,
  propertyTypes: ['apartment' as const],
  currency: 'USD' as const,
  maxPrice: '150000',
  locationIds: [LOCATION_ID],
  minRooms: 2,
};

function setup(options: { readonly siteUrl?: string | undefined } = {}) {
  const uow = new InMemoryClientsUnitOfWork();
  const tokens = new FakeSharedListingTokens();
  const emails = new FakeSubscriptionConfirmationEmails();
  const mailer = new RecordingMailer();
  const clock = new FixedClock('2026-11-04T15:00:00Z');
  const ids = new SequentialIdGenerator();
  const assignee = new InMemoryDefaultAssignee(DEFAULT_AGENT);
  const request = new RequestSearchSubscription({
    uow,
    tokens,
    emails,
    mailer,
    settings: new InMemoryCompanySettingsRepository(),
    siteUrl: 'siteUrl' in options ? options.siteUrl : SITE,
    ids,
    clock,
  });
  const confirm = new ConfirmSearchSubscription({ uow, tokens, assignee, ids, clock });
  const get = new GetSearchSubscription({ uow, tokens, clock });
  const purge = new PurgeExpiredSearchSubscriptions({ uow, clock });
  return { uow, emails, mailer, clock, assignee, request, confirm, get, purge };
}

/** El token del link de confirmación del último email. */
function tokenOf(emails: FakeSubscriptionConfirmationEmails): string {
  const url = emails.composed.at(-1)?.confirmUrl ?? '';
  return url.slice(url.lastIndexOf('/') + 1);
}

describe('RequestSearchSubscription', () => {
  it('saves it pending and emails the confirmation link', async () => {
    const { uow, emails, mailer, request } = setup();

    expect(unwrap(await request.execute(REQUEST, WEB))).toEqual({ requested: true });

    const [subscription] = [...uow.searchSubscriptions.rows.values()];
    expect(subscription).toMatchObject({
      summary: 'Departamentos en venta en Palermo',
      frequency: 'weekly',
      criteria: {
        operation: 'sale',
        propertyTypes: ['apartment'],
        currency: 'USD',
        maxPriceCents: 15_000_000n,
        locationIds: [LOCATION_ID],
        minRooms: 2,
      },
      confirmedAt: undefined,
      expiresAt: new Date('2026-11-07T15:00:00Z'),
    });
    expect(subscription?.contact?.name).toBe('Ana Pérez');
    expect(subscription?.contact?.email.value).toBe('ana@example.com');
    // Todavía no hay contacto ni búsqueda.
    expect(uow.clients.rows.size).toBe(0);
    expect(uow.savedSearches.rows.size).toBe(0);

    expect(mailer.sent.map((email) => email.to)).toEqual(['ana@example.com']);
    expect(emails.composed[0]).toMatchObject({
      firstName: 'Ana',
      searchSummary: 'Departamentos en venta en Palermo',
      frequencyLabel: 'una vez por semana',
      expiresAt: new Date('2026-11-07T15:00:00Z'),
    });
    expect(emails.composed[0]?.confirmUrl).toMatch(
      /^https:\/\/norde\.com\.ar\/suscripcion\/[A-Za-z0-9_-]{43}$/,
    );
  });

  it('audits the request without the name or the email', async () => {
    const { uow, request } = setup();

    unwrap(await request.execute(REQUEST, WEB));

    const [entry] = uow.audit.entries;
    expect(entry).toMatchObject({
      action: 'search_subscription.requested',
      entityType: 'search_subscription',
      clientIds: [],
      changes: { frequency: { before: null, after: 'weekly' } },
    });
    const serialized = JSON.stringify(entry, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    expect(serialized).not.toContain('ana@example.com');
    expect(serialized).not.toContain('Pérez');
  });

  it('stops emailing the same address after the daily cap, answering the same', async () => {
    const { uow, mailer, request } = setup();
    for (let i = 0; i < 3; i += 1) unwrap(await request.execute(REQUEST, WEB));

    expect(unwrap(await request.execute(REQUEST, WEB))).toEqual({ requested: true });

    expect(mailer.sent).toHaveLength(3);
    expect(uow.searchSubscriptions.rows.size).toBe(3);
  });

  it('keeps nothing when the email does not go out', async () => {
    const { uow, mailer, request } = setup();
    mailer.failWith = { type: 'MailUnavailable' };

    const error: RequestSearchSubscriptionError = unwrapErr(await request.execute(REQUEST, WEB));

    expect(error.type).toBe('MailUnavailable');
    expect(uow.searchSubscriptions.rows.size).toBe(0);
    expect(uow.audit.entries).toEqual([]);
  });

  it('rejects an invalid email', async () => {
    const { request } = setup();

    expect(unwrapErr(await request.execute({ ...REQUEST, email: 'ana@' }, WEB))).toEqual({
      type: 'InvalidEmail',
    });
  });

  it('rejects a daily frequency (only the advisor can set it)', async () => {
    const { request } = setup();

    const error = unwrapErr(
      // @ts-expect-error -- el contract no la acepta: es lo que se prueba.
      await request.execute({ ...REQUEST, frequency: 'daily' }, WEB),
    );

    expect(error.type).toBe('InvalidInput');
  });

  it('rejects a price without currency', async () => {
    const { request } = setup();

    const error = unwrapErr(await request.execute({ ...REQUEST, currency: undefined }, WEB));

    expect(error.type).toBe('InvalidInput');
  });

  it('needs the site URL to build the link', async () => {
    const { request } = setup({ siteUrl: undefined });

    expect(unwrapErr(await request.execute(REQUEST, WEB))).toEqual({
      type: 'SendingNotConfigured',
    });
  });

  it('is only for the web', async () => {
    const { request } = setup();

    expect(unwrapErr(await request.execute(REQUEST, Actor.system('web', [])))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('ConfirmSearchSubscription', () => {
  it('registers a new contact for the default advisor with the search', async () => {
    const { uow, emails, request, confirm } = setup();
    unwrap(await request.execute(REQUEST, WEB));

    const view = unwrap(await confirm.execute({ token: tokenOf(emails) }, WEB));

    expect(view).toEqual({
      summary: 'Departamentos en venta en Palermo',
      frequency: 'weekly',
      status: 'confirmed',
    });
    const [client] = [...uow.clients.rows.values()];
    expect(client).toMatchObject({
      name: 'Ana Pérez',
      agentId: DEFAULT_AGENT.userId,
      branchId: DEFAULT_AGENT.branchId,
    });
    expect(client?.emails.map((e) => e.email.value)).toEqual(['ana@example.com']);
    expect(client?.channels.map((c) => c.channel)).toEqual(['web_form']);

    const [search] = [...uow.savedSearches.rows.values()];
    expect(search).toMatchObject({
      clientId: client?.id,
      name: 'Departamentos en venta en Palermo',
      operation: 'sale',
      maxPriceCents: 15_000_000n,
      autoSend: true,
      frequency: 'weekly',
    });

    // Los datos personales quedan solo en el contacto.
    const [subscription] = [...uow.searchSubscriptions.rows.values()];
    expect(subscription).toMatchObject({
      contact: undefined,
      clientId: client?.id,
      savedSearchId: search?.id,
    });

    expect(uow.events.published.map((event) => event.type)).toEqual([
      'clients.client_registered',
      'clients.search_subscribed',
    ]);
    expect(uow.events.published.at(-1)?.payload).toMatchObject({
      clientId: client?.id,
      savedSearchId: search?.id,
      agentId: DEFAULT_AGENT.userId,
    });
    expect(uow.audit.entries.map((entry) => entry.action)).toEqual([
      'search_subscription.requested',
      'client.registered',
      'client.saved_search_created',
      'search_subscription.confirmed',
    ]);
    expect(uow.audit.entries.at(-1)?.clientIds).toEqual([client?.id]);
  });

  it('leaves a new contact without advisor when there is no default', async () => {
    const { uow, emails, assignee, request, confirm } = setup();
    assignee.current = undefined;
    unwrap(await request.execute(REQUEST, WEB));

    unwrap(await confirm.execute({ token: tokenOf(emails) }, WEB));

    const [client] = [...uow.clients.rows.values()];
    expect(client?.agentId).toBeUndefined();
  });

  it('adds the search to the existing contact, keeping its advisor', async () => {
    const { uow, emails, request, confirm } = setup();
    const existing = await seedClient(uow, {
      name: 'Ana P.',
      emails: ['ana@example.com'],
      agentId: 'user-martin',
    });
    unwrap(await request.execute(REQUEST, WEB));

    unwrap(await confirm.execute({ token: tokenOf(emails) }, WEB));

    expect(uow.clients.rows.size).toBe(1);
    expect(uow.clients.rows.get(existing.id)).toMatchObject({ agentId: 'user-martin' });
    expect([...uow.savedSearches.rows.values()].map((s) => s.clientId)).toEqual([existing.id]);
    expect(uow.events.published.at(-1)?.payload).toMatchObject({ agentId: 'user-martin' });
  });

  it('brings back a contact from the trash', async () => {
    const { uow, emails, request, confirm } = setup();
    const trashed = await seedClient(uow, { emails: ['ana@example.com'], deleted: true });
    unwrap(await request.execute(REQUEST, WEB));

    unwrap(await confirm.execute({ token: tokenOf(emails) }, WEB));

    expect(uow.clients.rows.get(trashed.id)?.deletedAt).toBeUndefined();
    expect(uow.audit.entries.map((entry) => entry.action)).toContain('client.restored');
  });

  it('confirming twice does not create another search', async () => {
    const { uow, emails, request, confirm } = setup();
    unwrap(await request.execute(REQUEST, WEB));
    const token = tokenOf(emails);
    unwrap(await confirm.execute({ token }, WEB));

    expect(unwrap(await confirm.execute({ token }, WEB)).status).toBe('confirmed');

    expect(uow.savedSearches.rows.size).toBe(1);
  });

  it('rejects an expired link', async () => {
    const { uow, emails, clock, request, confirm } = setup();
    unwrap(await request.execute(REQUEST, WEB));
    clock.advance(72 * HOUR);

    expect(unwrapErr(await confirm.execute({ token: tokenOf(emails) }, WEB))).toEqual({
      type: 'SearchSubscriptionExpired',
    });
    expect(uow.clients.rows.size).toBe(0);
  });

  it('rejects an unknown token', async () => {
    const { confirm } = setup();

    expect(unwrapErr(await confirm.execute({ token: 'nope'.padEnd(43, 'x') }, WEB))).toEqual({
      type: 'SearchSubscriptionNotFound',
    });
  });

  it('respects the limit of searches per contact', async () => {
    const { uow, emails, request, confirm } = setup();
    const existing = await seedClient(uow, { emails: ['ana@example.com'] });
    for (let i = 0; i < MAX_SAVED_SEARCHES_PER_CLIENT; i += 1) {
      seedSavedSearch(uow, {
        id: `00000000-0000-7000-8000-0000000001${i.toString().padStart(2, '0')}`,
        clientId: existing.id,
      });
    }
    unwrap(await request.execute(REQUEST, WEB));

    expect(unwrapErr(await confirm.execute({ token: tokenOf(emails) }, WEB))).toEqual({
      type: 'SavedSearchLimitReached',
      max: MAX_SAVED_SEARCHES_PER_CLIENT,
    });
    expect([...uow.searchSubscriptions.rows.values()][0]?.confirmedAt).toBeUndefined();
  });

  it('is only for the web', async () => {
    const { emails, request, confirm } = setup();
    unwrap(await request.execute(REQUEST, WEB));

    expect(
      unwrapErr(await confirm.execute({ token: tokenOf(emails) }, Actor.system('web', []))),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('GetSearchSubscription', () => {
  it('shows what the person is confirming, and when it expired', async () => {
    const { emails, clock, request, get } = setup();
    unwrap(await request.execute(REQUEST, WEB));
    const token = tokenOf(emails);

    expect(unwrap(await get.execute({ token }, WEB))).toEqual({
      summary: 'Departamentos en venta en Palermo',
      frequency: 'weekly',
      status: 'pending',
    });
    clock.advance(72 * HOUR);
    expect(unwrap(await get.execute({ token }, WEB)).status).toBe('expired');
  });
});

describe('PurgeExpiredSearchSubscriptions', () => {
  it('deletes the unconfirmed ones that expired and keeps the rest', async () => {
    const { uow, emails, clock, request, confirm, purge } = setup();
    unwrap(await request.execute(REQUEST, WEB));
    unwrap(await confirm.execute({ token: tokenOf(emails) }, WEB));
    unwrap(await request.execute({ ...REQUEST, email: 'otro@example.com' }, WEB));
    clock.advance(73 * HOUR);
    unwrap(await request.execute({ ...REQUEST, email: 'nuevo@example.com' }, WEB));

    expect(unwrap(await purge.execute(JOBS))).toEqual({ deleted: 1 });

    const left = [...uow.searchSubscriptions.rows.values()];
    expect(left.map((row) => row.confirmedAt !== undefined)).toEqual([true, false]);
  });

  it('is only for the scheduler', async () => {
    const { purge } = setup();

    expect(unwrapErr(await purge.execute(WEB))).toEqual({ type: 'Forbidden' });
  });
});
