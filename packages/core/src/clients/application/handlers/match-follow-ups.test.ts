import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import type { FollowUpListingProfile } from '../../contracts';
import {
  InMemoryClientsUnitOfWork,
  InMemoryFollowUpCandidates,
  InMemoryFollowUpListings,
  TEST_MANAGER,
} from '../../testing';

import { MatchFollowUps, type FollowUpTrigger } from './match-follow-ups';

const clock = new FixedClock('2026-10-27T12:00:00Z');
const JOBS = Actor.system('scheduler', ['clients:match-follow-ups']);
const PROPERTY_ID = '00000000-0000-7000-8000-0000000000e1';
const CLIENT_A = '00000000-0000-7000-8000-0000000000a1';
const CLIENT_B = '00000000-0000-7000-8000-0000000000a2';
const SEARCH_A = '00000000-0000-7000-8000-0000000000b1';
const SEARCH_B = '00000000-0000-7000-8000-0000000000b2';
const FEATURED_B = '00000000-0000-7000-8000-0000000000c2';
const LISTED_SINCE = new Date('2026-10-20T12:00:00Z');

const LISTED: FollowUpListingProfile = {
  propertyId: PROPERTY_ID,
  propertyType: 'apartment',
  operations: [
    { operation: 'sale', currency: 'USD', priceCents: 11_500_000n },
    { operation: 'rent', currency: 'ARS', priceCents: 90_000_000n },
  ],
  locationIds: [],
  rooms: 3,
  listed: true,
  listedSince: LISTED_SINCE,
};

const CHANGED: FollowUpTrigger = { kind: 'listing_changed' };
const DROPPED: FollowUpTrigger = {
  kind: 'price_changed',
  operation: 'sale',
  oldPriceCents: 12_000_000n,
  newPriceCents: 11_500_000n,
};

function setup(profile: FollowUpListingProfile = LISTED) {
  const uow = new InMemoryClientsUnitOfWork();
  const listings = new InMemoryFollowUpListings();
  listings.profiles.set(PROPERTY_ID, profile);
  const candidates = new InMemoryFollowUpCandidates();
  candidates.searchRows = [
    {
      savedSearchId: SEARCH_A,
      clientId: CLIENT_A,
      operation: 'sale',
      createdAt: new Date('2026-10-01T00:00:00Z'),
    },
    // Guardada después de que la propiedad salió: para esta búsqueda no es nueva.
    {
      savedSearchId: SEARCH_B,
      clientId: CLIENT_B,
      operation: 'rent',
      createdAt: new Date('2026-10-25T00:00:00Z'),
    },
  ];
  candidates.featuredRows = [
    { featuredListingId: FEATURED_B, clientId: CLIENT_B, propertyId: PROPERTY_ID },
  ];
  const match = new MatchFollowUps({
    uow,
    listings,
    candidates,
    ids: new SequentialIdGenerator(),
    clock,
  });
  return { uow, listings, candidates, match };
}

describe('MatchFollowUps', () => {
  it('matches a new listing with the searches saved before it was offered', async () => {
    const { uow, match } = setup();

    expect(
      unwrap(await match.execute({ propertyId: PROPERTY_ID, trigger: CHANGED }, JOBS)),
    ).toEqual({ matched: 1 });
    expect(uow.followUpMatches.rows).toEqual([
      expect.objectContaining({
        clientId: CLIENT_A,
        propertyId: PROPERTY_ID,
        reason: 'new_listing',
        source: { kind: 'saved_search', savedSearchId: SEARCH_A },
        price: { operation: 'sale', currency: 'USD', priceCents: 11_500_000n },
        detectedAt: clock.now(),
      }),
    ]);
    expect(uow.audit.entries.map((e) => [e.action, e.entityId, e.clientIds, e.changes])).toEqual([
      [
        'client.follow_up_matched',
        CLIENT_A,
        [CLIENT_A],
        {
          followUpMatchId: { before: null, after: uow.followUpMatches.rows[0]?.id },
          propertyId: { before: null, after: PROPERTY_ID },
          reason: { before: null, after: 'new_listing' },
          savedSearchId: { before: null, after: SEARCH_A },
          price: {
            before: null,
            after: { operation: 'sale', currency: 'USD', priceCents: 11_500_000n },
          },
        },
      ],
    ]);
  });

  it('does not match the same new listing twice for a client', async () => {
    const { uow, match } = setup();
    unwrap(await match.execute({ propertyId: PROPERTY_ID, trigger: CHANGED }, JOBS));

    expect(
      unwrap(await match.execute({ propertyId: PROPERTY_ID, trigger: CHANGED }, JOBS)),
    ).toEqual({ matched: 0 });
    expect(uow.followUpMatches.rows).toHaveLength(1);
    expect(uow.audit.entries).toHaveLength(1);
  });

  it('ignores a property the site does not show, or that does not exist', async () => {
    for (const missing of [false, true]) {
      const { uow, listings, match } = setup({ ...LISTED, listed: false });
      if (missing) listings.profiles.delete(PROPERTY_ID);
      for (const trigger of [CHANGED, DROPPED]) {
        expect(unwrap(await match.execute({ propertyId: PROPERTY_ID, trigger }, JOBS))).toEqual({
          matched: 0,
        });
      }
      expect(uow.followUpMatches.rows).toEqual([]);
    }
    const { match } = setup();
    expect(
      unwrap(await match.execute({ propertyId: 'not-an-id', trigger: CHANGED }, JOBS)),
    ).toEqual({ matched: 0 });
  });

  it('matches a price drop with the searches of that operation and the featured', async () => {
    const { uow, match } = setup();

    expect(
      unwrap(await match.execute({ propertyId: PROPERTY_ID, trigger: DROPPED }, JOBS)),
    ).toEqual({ matched: 2 });
    const price = { operation: 'sale', currency: 'USD', priceCents: 11_500_000n };
    expect(uow.followUpMatches.rows.map((m) => [m.clientId, m.reason, m.source, m.price])).toEqual([
      [CLIENT_A, 'price_drop', { kind: 'saved_search', savedSearchId: SEARCH_A }, price],
      [CLIENT_B, 'price_drop', { kind: 'featured', featuredListingId: FEATURED_B }, price],
    ]);
    expect(uow.audit.entries[1]?.changes).toMatchObject({
      featuredListingId: { before: null, after: FEATURED_B },
    });
  });

  it('matches each drop once, and a new lower price again', async () => {
    const { uow, match } = setup();
    unwrap(await match.execute({ propertyId: PROPERTY_ID, trigger: DROPPED }, JOBS));
    expect(
      unwrap(await match.execute({ propertyId: PROPERTY_ID, trigger: DROPPED }, JOBS)),
    ).toEqual({ matched: 0 });

    const { match: again, uow: next } = setup({
      ...LISTED,
      operations: [{ operation: 'sale', currency: 'USD', priceCents: 11_000_000n }],
    });
    next.followUpMatches.rows.push(...uow.followUpMatches.rows);
    const lower: FollowUpTrigger = {
      ...DROPPED,
      oldPriceCents: 11_500_000n,
      newPriceCents: 11_000_000n,
    };
    expect(unwrap(await again.execute({ propertyId: PROPERTY_ID, trigger: lower }, JOBS))).toEqual({
      matched: 2,
    });
  });

  it('does not match a raise, a currency change or a stale event', async () => {
    const { uow, match } = setup();
    const triggers: FollowUpTrigger[] = [
      { ...DROPPED, oldPriceCents: 11_000_000n, newPriceCents: 11_500_000n },
      { ...DROPPED, oldPriceCents: undefined },
      // Ya cambió otra vez: el precio de ahora no es el del evento.
      { ...DROPPED, oldPriceCents: 13_000_000n, newPriceCents: 12_000_000n },
    ];
    for (const trigger of triggers) {
      expect(unwrap(await match.execute({ propertyId: PROPERTY_ID, trigger }, JOBS))).toEqual({
        matched: 0,
      });
    }
    expect(uow.followUpMatches.rows).toEqual([]);
  });

  it('walks every page of candidates', async () => {
    const { uow, candidates, match } = setup();
    candidates.searchRows = Array.from({ length: 450 }, (_, i) => {
      const n = (0x100 + i).toString(16).padStart(12, '0');
      return {
        savedSearchId: `00000000-0000-7000-8000-${n}`,
        clientId: `00000000-0000-7000-9000-${n}`,
        operation: 'sale',
        createdAt: new Date('2026-10-01T00:00:00Z'),
      };
    });

    expect(
      unwrap(await match.execute({ propertyId: PROPERTY_ID, trigger: CHANGED }, JOBS)),
    ).toEqual({ matched: 450 });
    expect(uow.followUpMatches.rows).toHaveLength(450);
  });

  it('runs only as the system with its permission', async () => {
    const { match } = setup();
    const input = { propertyId: PROPERTY_ID, trigger: CHANGED };
    expect(unwrapErr(await match.execute(input, TEST_MANAGER))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await match.execute(input, Actor.system('scheduler', [])))).toEqual({
      type: 'Forbidden',
    });
  });
});
