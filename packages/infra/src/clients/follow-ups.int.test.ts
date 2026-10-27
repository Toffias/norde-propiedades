import {
  MatchFollowUps,
  type FollowUpListingProfile,
  type FollowUpMatch,
} from '@norde/core/clients';
import { Actor, parseId, type Result } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { auditLog, clients, featuredListings, followUpMatches, savedSearches } from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { createClientsUnitOfWork } from './clients-unit-of-work';
import { DrizzleClientLinkedRecords } from './drizzle-client-linked-records';
import {
  DrizzleFollowUpCandidatesQuery,
  DrizzleFollowUpMatchRepository,
} from './drizzle-follow-up-repositories';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const USER = '00000000-0000-7000-8000-0000000000a1';
const PROPERTY = '00000000-0000-7000-8000-0000000000e1';
const NOW = new Date('2026-10-27T12:00:00Z');
const LISTED_SINCE = new Date('2026-10-20T12:00:00Z');
const stamps = { createdAt: NOW, updatedAt: NOW, createdBy: USER, updatedBy: USER };
const JOBS = Actor.system('scheduler', ['clients:match-follow-ups']);

const PROFILE: FollowUpListingProfile = {
  propertyId: PROPERTY,
  propertyType: 'apartment',
  operations: [{ operation: 'sale', currency: 'USD', priceCents: 11_500_000n }],
  locationIds: [],
  rooms: 3,
  listed: true,
  listedSince: LISTED_SINCE,
};

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(`Expected Ok: ${JSON.stringify(result.error)}`);
  return result.value;
}

async function aClient(name: string, deletedAt: Date | null = null) {
  const id = ids.next();
  await db.insert(clients).values({ id, name, deletedAt, ...stamps });
  return id;
}

async function aSearch(
  clientId: string,
  values: Partial<typeof savedSearches.$inferInsert> = {},
): Promise<string> {
  const id = ids.next();
  await db.insert(savedSearches).values({
    id,
    clientId,
    operation: 'sale',
    autoSend: true,
    ...stamps,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    ...values,
  });
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

describe('DrizzleFollowUpCandidatesQuery', () => {
  it('finds the matching searches with auto-send of active, subscribed clients', async () => {
    const ana = await aClient('Ana');
    const trashed = await aClient('Papelera', NOW);
    const wanted = await aSearch(ana);
    await aSearch(ana, { autoSend: false });
    await aSearch(ana, { deletedAt: NOW, deletedBy: USER });
    await aSearch(ana, { unsubscribedAt: NOW });
    await aSearch(ana, { minRooms: 4 });
    await aSearch(ana, { operation: 'rent' });
    await aSearch(trashed);

    const rows = await new DrizzleFollowUpCandidatesQuery(db).searches({
      profile: PROFILE,
      operation: undefined,
      savedUntil: undefined,
      offset: 0,
      limit: 50,
    });
    expect(rows).toEqual([{ savedSearchId: wanted, clientId: ana, operation: 'sale' }]);
  });

  it('filters by operation and by when the search was saved, and pages by id', async () => {
    const ana = await aClient('Ana');
    const before = await aSearch(ana);
    const after = await aSearch(ana, { createdAt: new Date('2026-10-25T00:00:00Z') });
    const query = new DrizzleFollowUpCandidatesQuery(db);
    const page = (criteria: Partial<Parameters<typeof query.searches>[0]>) =>
      query.searches({
        profile: PROFILE,
        operation: undefined,
        savedUntil: undefined,
        offset: 0,
        limit: 50,
        ...criteria,
      });

    expect((await page({ savedUntil: LISTED_SINCE })).map((r) => r.savedSearchId)).toEqual([
      before,
    ]);
    expect(await page({ operation: 'rent' })).toEqual([]);
    expect((await page({ limit: 1 })).map((r) => r.savedSearchId)).toEqual([before]);
    expect((await page({ offset: 1, limit: 1 })).map((r) => r.savedSearchId)).toEqual([after]);
  });

  it('finds the active featured of the property with auto-send', async () => {
    const ana = await aClient('Ana');
    const beto = await aClient('Beto');
    const trashed = await aClient('Papelera', NOW);
    const wanted = await aFeatured(ana);
    await aFeatured(beto, false);
    await aFeatured(trashed);
    const removed = await aFeatured(await aClient('Quitada'));
    await db
      .update(featuredListings)
      .set({ removedAt: NOW })
      .where(eq(featuredListings.id, removed));

    expect(
      await new DrizzleFollowUpCandidatesQuery(db).featured({
        propertyId: PROPERTY,
        offset: 0,
        limit: 50,
      }),
    ).toEqual([{ featuredListingId: wanted, clientId: ana }]);
  });
});

describe('DrizzleFollowUpMatchRepository', () => {
  it('keeps a new listing once per client and each price drop once per price', async () => {
    const ana = await aClient('Ana');
    const search = await aSearch(ana);
    const repo = new DrizzleFollowUpMatchRepository(db);
    const drop = (priceCents: bigint) =>
      aMatch(ana, search, {
        reason: 'price_drop',
        price: { operation: 'sale', currency: 'USD', priceCents },
      });

    expect(await repo.add(aMatch(ana, search), USER)).toBe(true);
    expect(await repo.add(aMatch(ana, search), USER)).toBe(false);
    expect(await repo.add(drop(11_500_000n), USER)).toBe(true);
    expect(await repo.add(drop(11_500_000n), USER)).toBe(false);
    expect(await repo.add(drop(11_000_000n), USER)).toBe(true);

    const rows = await db.select().from(followUpMatches).orderBy(followUpMatches.id);
    expect(rows.map((r) => [r.reason, r.savedSearchId, r.priceCents])).toEqual([
      ['new_listing', search, 11_500_000n],
      ['price_drop', search, 11_500_000n],
      ['price_drop', search, 11_000_000n],
    ]);
  });
});

describe('MatchFollowUps', () => {
  it('saves the matches and audits them against the client, once', async () => {
    const ana = await aClient('Ana');
    const search = await aSearch(ana);
    const match = new MatchFollowUps({
      uow: createClientsUnitOfWork(db, { ids, clock: new FixedClock(NOW) }),
      listings: { find: () => Promise.resolve(PROFILE) },
      candidates: new DrizzleFollowUpCandidatesQuery(db),
      ids,
      clock: new FixedClock(NOW),
    });
    const input = { propertyId: PROPERTY, trigger: { kind: 'listing_changed' as const } };

    expect(unwrap(await match.execute(input, JOBS))).toEqual({ matched: 1 });
    expect(unwrap(await match.execute(input, JOBS))).toEqual({ matched: 0 });

    const [row] = await db.select().from(followUpMatches);
    expect(row).toMatchObject({
      clientId: ana,
      propertyId: PROPERTY,
      reason: 'new_listing',
      savedSearchId: search,
      detectedAt: NOW,
      sentAt: null,
      createdBy: 'system:scheduler',
    });
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, ana));
    expect(audits.map((a) => [a.action, a.clientIds, a.actorId])).toEqual([
      ['client.follow_up_matched', [ana], 'system:scheduler'],
    ]);
  });
});

describe('merging clients', () => {
  it('moves the matches to the main client without repeating one it already has', async () => {
    const main = await aClient('Principal');
    const duplicate = await aClient('Duplicado');
    const mainSearch = await aSearch(main);
    const duplicateSearch = await aSearch(duplicate);
    const repo = new DrizzleFollowUpMatchRepository(db);
    await repo.add(aMatch(main, mainSearch), USER);
    await repo.add(aMatch(duplicate, duplicateSearch), USER);
    const kept = aMatch(duplicate, duplicateSearch, {
      reason: 'price_drop',
      price: { operation: 'sale', currency: 'USD', priceCents: 11_000_000n },
    });
    await repo.add(kept, USER);

    await new DrizzleClientLinkedRecords(db).moveAll(duplicate, main, NOW);

    const rows = await db.select().from(followUpMatches).orderBy(followUpMatches.id);
    expect(rows.map((r) => [r.clientId, r.reason])).toEqual([
      [main, 'new_listing'],
      [main, 'price_drop'],
    ]);
    expect(rows[1]?.id).toBe(kept.id);
  });
});
