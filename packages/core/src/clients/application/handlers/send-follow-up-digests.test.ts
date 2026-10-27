import { describe, expect, it } from 'vitest';

import { Actor, parseId } from '../../../shared';
import { InMemoryCompanySettingsRepository, RecordingMailer } from '../../../settings/testing';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import type { ClientId } from '../../domain/client';
import { FeaturedListing } from '../../domain/featured-listing';
import type { FollowUpMatch, FollowUpReason, FollowUpSource } from '../../domain/follow-up-match';
import {
  aListing,
  FakeSharedListingEmails,
  FakeSharedListingTokens,
  InMemoryClientAgents,
  InMemoryClientListings,
  InMemoryClientsUnitOfWork,
  InMemoryPendingFollowUps,
  InMemoryPublicListings,
  OTHER_PROPERTY_ID,
  PROPERTY_ID,
  seedClient,
  seedOpportunity,
  seedSavedSearch,
  TEST_MANAGER,
} from '../../testing';

import { SendFollowUpDigests } from './send-follow-up-digests';

const SITE = 'https://norde.com.ar';
const JOBS = Actor.system('scheduler', ['clients:send-follow-ups', 'properties:read']);
const SEARCH_ID = '00000000-0000-7000-8000-0000000000b1';
const OTHER_SEARCH_ID = '00000000-0000-7000-8000-0000000000b2';
const FEATURED_ID = '00000000-0000-7000-8000-0000000000d1';

let matchSequence = 0;

function idOf<T extends string>(raw: string) {
  const id = parseId<T>(raw);
  if (id.isErr()) throw new Error(`ID de prueba inválido: ${raw}`);
  return id.value;
}

function searchSource(id = SEARCH_ID): FollowUpSource {
  return { kind: 'saved_search', savedSearchId: idOf<'SavedSearch'>(id) };
}

function aMatch(
  clientId: ClientId,
  propertyId: string,
  options: { readonly reason?: FollowUpReason; readonly source?: FollowUpSource } = {},
): FollowUpMatch {
  matchSequence += 1;
  return {
    id: idOf<'FollowUpMatch'>(
      `00000000-0000-7000-8000-f${matchSequence.toString().padStart(11, '0')}`,
    ),
    clientId,
    propertyId,
    reason: options.reason ?? 'new_listing',
    source: options.source ?? searchSource(),
    price: { operation: 'sale', currency: 'USD', priceCents: 12_000_000n },
    detectedAt: new Date(Date.UTC(2026, 9, 26, 12, 0, matchSequence)),
  };
}

async function setup(options: { readonly siteUrl?: string | undefined } = {}) {
  const uow = new InMemoryClientsUnitOfWork();
  const client = await seedClient(uow, { name: 'Ana Pérez', emails: ['ana@example.com'] });
  seedSavedSearch(uow, {
    id: SEARCH_ID,
    clientId: client.id,
    fields: { autoSend: true, name: 'Depto en venta' },
  });
  const listings = new InMemoryClientListings();
  const publicListings = new InMemoryPublicListings();
  const emails = new FakeSharedListingEmails();
  const mailer = new RecordingMailer();
  const digests = new SendFollowUpDigests({
    uow,
    pending: new InMemoryPendingFollowUps(uow.followUpMatches),
    listings,
    publicListings,
    tokens: new FakeSharedListingTokens(),
    emails,
    mailer,
    settings: new InMemoryCompanySettingsRepository(),
    agents: new InMemoryClientAgents(),
    siteUrl: 'siteUrl' in options ? options.siteUrl : SITE,
    ids: new SequentialIdGenerator(),
    clock: new FixedClock('2026-10-27T13:00:00Z'),
  });
  return { uow, client, listings, publicListings, emails, mailer, digests };
}

function pendingOf(uow: InMemoryClientsUnitOfWork): string[] {
  return uow.followUpMatches.rows
    .filter((row) => !uow.followUpMatches.resolved.has(row.id))
    .map((row) => row.id);
}

describe('SendFollowUpDigests', () => {
  it('emails one digest per client with the unsubscribe link and records it', async () => {
    const { uow, client, digests, mailer, emails } = await setup();
    await seedOpportunity(uow, client);
    const fresh = aMatch(client.id, PROPERTY_ID);
    const drop = aMatch(client.id, OTHER_PROPERTY_ID, { reason: 'price_drop' });
    const again = aMatch(client.id, PROPERTY_ID, { reason: 'price_drop' });
    uow.followUpMatches.rows.push(fresh, drop, again);

    const outcome = unwrap(await digests.execute(JOBS));

    expect(outcome).toEqual({ sent: 1, discarded: 0, failures: [] });
    expect(mailer.sent.map((email) => email.to)).toEqual(['ana@example.com']);
    const [content] = emails.composed;
    expect(content).toMatchObject({
      advisorName: 'Camila',
      subject: 'Norde Propiedades: propiedades nuevas y bajas de precio para vos',
      listings: [{ id: PROPERTY_ID }, { id: OTHER_PROPERTY_ID }],
    });
    expect(content?.message).toContain('¡Hola, Ana!');
    expect(content?.url).toMatch(/^https:\/\/norde\.com\.ar\/e\/[A-Za-z0-9_-]{43}$/);
    expect(content?.unsubscribeUrl).toBe(`${content?.url ?? ''}/baja`);

    // Un envío como los del asesor, sin oportunidad: no es el asesor el que contacta.
    const [listing] = [...uow.sharedListings.rows.values()];
    expect(listing).toMatchObject({
      clientId: client.id,
      opportunityId: undefined,
      channel: 'email',
      sentBy: JOBS.id,
    });
    expect(listing?.items.map((item) => item.propertyId)).toEqual([PROPERTY_ID, OTHER_PROPERTY_ID]);
    expect(pendingOf(uow)).toEqual([]);
    expect(uow.followUpMatches.resolved.get(fresh.id)).toEqual({
      kind: 'sent',
      sharedListingId: listing?.id,
    });
    expect([...uow.activities.rows.values()]).toMatchObject([
      { clientId: client.id, opportunityId: undefined, body: { kind: 'listing_sent' } },
    ]);
    expect(uow.events.published.map((event) => event.type)).toEqual(['clients.listings_sent']);
    expect(uow.audit.entries).toMatchObject([
      {
        action: 'client.follow_ups_sent',
        entityId: client.id,
        actorId: JOBS.id,
        changes: {
          sharedListingId: { before: null, after: listing?.id },
          propertyIds: { before: null, after: [PROPERTY_ID, OTHER_PROPERTY_ID] },
          followUpMatchIds: { before: null, after: [fresh.id, drop.id, again.id] },
        },
      },
    ]);

    // Al día siguiente no queda nada pendiente.
    expect(unwrap(await digests.execute(JOBS))).toEqual({ sent: 0, discarded: 0, failures: [] });
    expect(mailer.sent).toHaveLength(1);
  });

  it('discards what no longer applies before sending', async () => {
    const { uow, client, digests, emails, publicListings } = await setup();
    // Una búsqueda que ya no manda (se apagó el envío) y una destacada sin auto-envío.
    seedSavedSearch(uow, { id: OTHER_SEARCH_ID, clientId: client.id });
    const featured = FeaturedListing.feature({
      id: idOf<'FeaturedListing'>(FEATURED_ID),
      clientId: client.id,
      propertyId: PROPERTY_ID,
      opportunityId: undefined,
      matchScore: undefined,
      by: TEST_MANAGER.id,
      now: new Date('2026-10-01T12:00:00Z'),
    });
    await uow.featured.save(featured);
    const hiddenProperty = '00000000-0000-7000-8000-0000000000e9';
    publicListings.hidden = [hiddenProperty];

    const wanted = aMatch(client.id, PROPERTY_ID);
    const searchOff = aMatch(client.id, OTHER_PROPERTY_ID, {
      source: searchSource(OTHER_SEARCH_ID),
    });
    const featuredOff = aMatch(client.id, OTHER_PROPERTY_ID, {
      reason: 'price_drop',
      source: { kind: 'featured', featuredListingId: featured.id },
    });
    const unlisted = aMatch(client.id, hiddenProperty);
    uow.followUpMatches.rows.push(wanted, searchOff, featuredOff, unlisted);

    const outcome = unwrap(await digests.execute(JOBS));

    expect(outcome).toEqual({ sent: 1, discarded: 0, failures: [] });
    expect(emails.composed[0]?.listings.map((l) => l.id)).toEqual([PROPERTY_ID]);
    for (const stale of [searchOff, featuredOff, unlisted]) {
      expect(uow.followUpMatches.resolved.get(stale.id)).toEqual({ kind: 'discarded' });
    }
    expect(uow.audit.entries.map((entry) => entry.action)).toEqual([
      'client.follow_ups_discarded',
      'client.follow_ups_sent',
    ]);
    expect(uow.audit.entries[0]?.changes).toEqual({
      followUpMatchIds: { before: null, after: [searchOff.id, featuredOff.id, unlisted.id] },
    });
  });

  it('discards everything of a client without email or in the trash', async () => {
    const { uow, digests, mailer } = await setup();
    const noEmail = await seedClient(uow, { emails: [] });
    const trashed = await seedClient(uow, { emails: ['b@example.com'], deleted: true });
    const first = aMatch(noEmail.id, PROPERTY_ID);
    const second = aMatch(trashed.id, PROPERTY_ID);
    uow.followUpMatches.rows.push(first, second);

    expect(unwrap(await digests.execute(JOBS))).toEqual({ sent: 0, discarded: 2, failures: [] });
    expect(mailer.sent).toHaveLength(0);
    expect(uow.sharedListings.rows.size).toBe(0);
    expect(pendingOf(uow)).toEqual([]);
  });

  it('sends up to 20 properties and leaves the rest for the next day', async () => {
    const { uow, client, digests, listings, emails } = await setup();
    const ids = Array.from(
      { length: 22 },
      (_, n) => `00000000-0000-7000-8000-00000000e${(n + 100).toString()}`,
    );
    listings.listings = ids.map((id, n) => aListing({ id, code: `NOR-${n.toString()}` }));
    const matches = ids.map((id) => aMatch(client.id, id));
    uow.followUpMatches.rows.push(...matches);

    unwrap(await digests.execute(JOBS));

    expect(emails.composed[0]?.listings).toHaveLength(20);
    expect(pendingOf(uow)).toEqual(matches.slice(20).map((match) => match.id));
  });

  it('keeps the matches pending when the email fails, and goes on with the others', async () => {
    const { uow, client, digests, mailer } = await setup();
    const other = await seedClient(uow, { emails: ['otro@example.com'] });
    seedSavedSearch(uow, {
      id: OTHER_SEARCH_ID,
      clientId: other.id,
      fields: { autoSend: true },
    });
    uow.followUpMatches.rows.push(
      aMatch(client.id, PROPERTY_ID),
      aMatch(other.id, PROPERTY_ID, { source: searchSource(OTHER_SEARCH_ID) }),
    );
    mailer.failWith = { type: 'MailUnavailable' };

    const outcome = unwrap(await digests.execute(JOBS));

    expect(outcome.sent).toBe(0);
    expect(outcome.failures.map((failure) => failure.error)).toEqual([
      { type: 'MailUnavailable' },
      { type: 'MailUnavailable' },
    ]);
    expect(pendingOf(uow)).toHaveLength(2);
    expect(uow.sharedListings.rows.size).toBe(0);
    expect(uow.audit.entries).toHaveLength(0);
  });

  it('needs the public site URL', async () => {
    const { digests } = await setup({ siteUrl: undefined });

    expect(unwrapErr(await digests.execute(JOBS))).toEqual({ type: 'SendingNotConfigured' });
  });

  it('only runs as the system with its permission', async () => {
    const { digests } = await setup();

    expect(unwrapErr(await digests.execute(TEST_MANAGER))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await digests.execute(Actor.system('scheduler', [])))).toEqual({
      type: 'Forbidden',
    });
  });
});
