import {
  Client,
  SendFollowUpDigests,
  UnsubscribeFromFollowUps,
  type ClientListingSummary,
  type FollowUpMatch,
} from '@norde/core/clients';
import { CompanySettings } from '@norde/core/settings';
import { Actor, Email, ok, parseId } from '@norde/core/shared';
import { FixedClock, unwrap } from '@norde/core/shared/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { RandomSharedListingTokens } from '../adapters/crypto/random-shared-listing-tokens';
import { HtmlSharedListingEmails } from '../adapters/mail/html-shared-listing-emails';
import {
  auditLog,
  clients,
  featuredListings,
  followUpMatches,
  savedSearches,
  sharedListings,
} from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { createClientsUnitOfWork } from './clients-unit-of-work';
import { DrizzleFeaturedListingRepository } from './drizzle-client-activity-repositories';
import { DrizzleClientRepository } from './drizzle-client-repositories';
import {
  DrizzleFollowUpMatchRepository,
  DrizzlePendingFollowUpsQuery,
} from './drizzle-follow-up-repositories';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const USER = '00000000-0000-7000-8000-0000000000a1';
const PROPERTY = '00000000-0000-7000-8000-0000000000e1';
const NOW = new Date('2026-10-27T13:00:00Z');
const stamps = { createdAt: NOW, updatedAt: NOW, createdBy: USER, updatedBy: USER };
const SCHEDULER = Actor.system('scheduler', ['clients:send-follow-ups', 'properties:read']);
const WEB = Actor.system('web', ['clients:respond-to-listings']);

async function aClient(name: string) {
  const id = ids.next();
  await db.insert(clients).values({ id, name, ...stamps });
  return id;
}

async function aSearch(clientId: string): Promise<string> {
  const id = ids.next();
  await db
    .insert(savedSearches)
    .values({ id, clientId, operation: 'sale', autoSend: true, ...stamps });
  return id;
}

async function aFeatured(clientId: string, autoSendUpdates = true): Promise<string> {
  const id = ids.next();
  await db.insert(featuredListings).values({
    id,
    clientId,
    propertyId: PROPERTY,
    autoSendUpdates,
    featuredBy: USER,
    featuredAt: NOW,
    ...stamps,
  });
  return id;
}

function aMatch(
  clientId: string,
  savedSearchId: string,
  overrides: Partial<FollowUpMatch> = {},
): FollowUpMatch {
  return {
    id: unwrap(parseId<'FollowUpMatch'>(ids.next())),
    clientId: unwrap(parseId<'Client'>(clientId)),
    propertyId: PROPERTY,
    reason: 'new_listing',
    source: {
      kind: 'saved_search',
      savedSearchId: unwrap(parseId<'SavedSearch'>(savedSearchId)),
    },
    price: { operation: 'sale', currency: 'USD', priceCents: 11_500_000n },
    detectedAt: NOW,
    ...overrides,
  };
}

function aDrop(clientId: string, savedSearchId: string, priceCents: bigint): FollowUpMatch {
  return aMatch(clientId, savedSearchId, {
    reason: 'price_drop',
    price: { operation: 'sale', currency: 'USD', priceCents },
  });
}

function summary(id: string): ClientListingSummary {
  return {
    id,
    code: 'NOR-001',
    title: 'Departamento',
    address: undefined,
    status: 'available',
    operations: [],
    cover: undefined,
    producer: undefined,
  };
}

describe('DrizzleFollowUpMatchRepository pending matches', () => {
  it('lists them oldest first and marks them sent or discarded once', async () => {
    const ana = await aClient('Ana');
    const search = await aSearch(ana);
    const repo = new DrizzleFollowUpMatchRepository(db);
    const older = aMatch(ana, search, { detectedAt: new Date('2026-10-26T12:00:00Z') });
    const newer = aDrop(ana, search, 11_000_000n);
    const stale = aDrop(ana, search, 10_000_000n);
    for (const match of [newer, older, stale]) await repo.add(match, USER);

    expect((await repo.findPending(older.clientId, 10)).map((m) => m.id)).toEqual([
      older.id,
      newer.id,
      stale.id,
    ]);
    expect((await repo.findPending(older.clientId, 1)).map((m) => m.id)).toEqual([older.id]);

    const sendId = ids.next();
    await db.insert(sharedListings).values({
      id: sendId,
      tokenHash: 'hash',
      clientId: ana,
      channel: 'email',
      sentBy: 'system:scheduler',
      sentAt: NOW,
      ...stamps,
    });
    const later = new Date('2026-10-28T13:00:00Z');
    await repo.markSent(
      [older.id, newer.id],
      unwrap(parseId<'SharedListing'>(sendId)),
      NOW,
      'system:scheduler',
    );
    await repo.discard([stale.id], NOW, 'system:scheduler');
    // Una ya resuelta no se vuelve a tocar.
    await repo.discard([older.id], later, 'system:scheduler');

    expect(await repo.findPending(older.clientId, 10)).toEqual([]);
    const rows = await db.select().from(followUpMatches);
    const byId = new Map(rows.map((r) => [r.id, [r.sharedListingId, r.sentAt, r.discardedAt]]));
    expect(byId.get(older.id)).toEqual([sendId, NOW, null]);
    expect(byId.get(newer.id)).toEqual([sendId, NOW, null]);
    expect(byId.get(stale.id)).toEqual([null, null, NOW]);
  });

  it('pages the clients with pending matches by id, skipping the ones without a source', async () => {
    const first = await aClient('Ana');
    const second = await aClient('Beto');
    const orphan = await aClient('Sin fuente');
    const repo = new DrizzleFollowUpMatchRepository(db);
    await repo.add(aMatch(first, await aSearch(first)), USER);
    const secondSearch = await aSearch(second);
    await repo.add(aMatch(second, secondSearch), USER);
    await repo.add(aDrop(second, secondSearch, 1n), USER);
    const orphanSearch = await aSearch(orphan);
    await repo.add(aMatch(orphan, orphanSearch), USER);
    await db.delete(savedSearches).where(eq(savedSearches.id, orphanSearch));

    const query = new DrizzlePendingFollowUpsQuery(db);
    const [low, high] = [first, second].sort();

    expect(await query.clients({ after: undefined, limit: 10 })).toEqual([low, high]);
    expect(await query.clients({ after: undefined, limit: 1 })).toEqual([low]);
    expect(await query.clients({ after: low, limit: 10 })).toEqual([high]);
    expect(await repo.findPending(unwrap(parseId<'Client'>(orphan)), 10)).toEqual([]);
  });
});

describe('DrizzleFeaturedListingRepository', () => {
  it('finds featured by id and the active ones with auto-send of a client', async () => {
    const ana = await aClient('Ana');
    const on = await aFeatured(ana);
    const off = await aFeatured(await aClient('Beto'), false);
    const repo = new DrizzleFeaturedListingRepository(db);
    const clientId = unwrap(parseId<'Client'>(ana));

    const found = await repo.findByIds([
      unwrap(parseId<'FeaturedListing'>(on)),
      unwrap(parseId<'FeaturedListing'>(off)),
    ]);
    expect(found.map((f) => f.id).sort()).toEqual([on, off].sort());
    expect((await repo.findAutoSending(clientId, 10)).map((f) => f.id)).toEqual([on]);

    await db.update(featuredListings).set({ removedAt: NOW }).where(eq(featuredListings.id, on));
    expect(await repo.findAutoSending(clientId, 10)).toEqual([]);
  });
});

describe('SendFollowUpDigests and UnsubscribeFromFollowUps', () => {
  it('sends the daily digest, and its unsubscribe link stops the next ones', async () => {
    const clientId = unwrap(parseId<'Client'>(ids.next()));
    const email = Email.create('ana@example.com');
    if (email.isErr()) throw new Error('invalid fixture');
    const created = Client.create({
      id: clientId,
      kind: 'person',
      name: 'Ana Pérez',
      phones: [],
      emails: [{ kind: 'main', email: email.value }],
      clientTypes: [],
      agentId: undefined,
      branchId: undefined,
      profile: {},
      now: NOW,
    });
    if (created.isErr()) throw new Error(created.error.type);
    await new DrizzleClientRepository(db, ids).save(created.value, USER);
    const search = await aSearch(clientId);
    await new DrizzleFollowUpMatchRepository(db).add(aMatch(clientId, search), USER);

    const clock = new FixedClock(NOW);
    const uow = createClientsUnitOfWork(db, { ids, clock });
    const tokens = new RandomSharedListingTokens();
    const mailed: string[] = [];
    const digests = new SendFollowUpDigests({
      uow,
      pending: new DrizzlePendingFollowUpsQuery(db),
      listings: {
        summaries: (propertyIds) =>
          Promise.resolve(new Map(propertyIds.map((id) => [id, summary(id)] as const))),
      },
      publicListings: { unlisted: () => Promise.resolve([]) },
      tokens,
      emails: new HtmlSharedListingEmails(),
      mailer: {
        send: (outgoing) => {
          mailed.push(outgoing.text);
          return Promise.resolve(ok(undefined));
        },
      },
      settings: { get: () => Promise.resolve(CompanySettings.defaults()) },
      agents: { names: () => Promise.resolve(new Map()) },
      siteUrl: 'https://norde.com.ar',
      ids,
      clock,
    });

    expect(unwrap(await digests.execute(SCHEDULER))).toEqual({
      sent: 1,
      discarded: 0,
      failures: [],
    });
    const [send] = await db
      .select()
      .from(sharedListings)
      .where(eq(sharedListings.clientId, clientId));
    expect(send).toMatchObject({ sentBy: 'system:scheduler', opportunityId: null });
    const [row] = await db.select().from(followUpMatches);
    expect(row).toMatchObject({ sentAt: NOW, sharedListingId: send?.id });

    const token = /\/e\/([A-Za-z0-9_-]+)\/baja/.exec(mailed[0] ?? '')?.[1] ?? '';
    unwrap(await new UnsubscribeFromFollowUps({ uow, tokens, clock }).execute({ token }, WEB));

    const [stored] = await db.select().from(savedSearches).where(eq(savedSearches.id, search));
    expect(stored).toMatchObject({ autoSend: false, unsubscribedAt: NOW });
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, clientId));
    expect(audits.map((a) => [a.action, a.clientIds])).toEqual(
      expect.arrayContaining([
        ['client.follow_ups_sent', [clientId]],
        ['client.follow_ups_unsubscribed', [clientId]],
      ]) as unknown,
    );
  });
});
