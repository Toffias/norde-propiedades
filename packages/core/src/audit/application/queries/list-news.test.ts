import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import type { NewsHeader } from '../../contracts';
import {
  FixedNewsScope,
  InMemoryNewsFeedQuery,
  InMemoryNewsUserNames,
  type InMemoryNewsEntry,
} from '../../testing';
import { ListNews } from './list-news';

const CAMILA = '01900000-0000-7000-8000-0000000000a1';
const PEDRO = '01900000-0000-7000-8000-0000000000a2';
const PROPERTY = '01900000-0000-7000-8000-0000000000b1';
const OTHER_PROPERTY = '01900000-0000-7000-8000-0000000000b2';
const CLIENT = '01900000-0000-7000-8000-0000000000c1';
const NORTH = '01900000-0000-7000-8000-0000000000d1';
const SOUTH = '01900000-0000-7000-8000-0000000000d2';

const reader = Actor.user(CAMILA, ['news:read']).withBranch(NORTH);

const propertyHeader: NewsHeader = {
  entityType: 'property',
  code: 'P-001',
  title: 'Miralla 745 2° B',
  propertyType: 'apartment',
  neighborhood: 'Villa Luro',
  status: 'available',
  operations: [{ operation: 'sale', currency: 'USD', priceCents: 12_800_000n }],
  deleted: false,
};
const clientHeader: NewsHeader = { entityType: 'client', name: 'Ana', tags: [], deleted: false };

let sequence = 0;
function entry(
  entityType: 'property' | 'client',
  entityId: string,
  action: string,
  at: string,
  changes: InMemoryNewsEntry['changes'] = {},
): InMemoryNewsEntry {
  sequence += 1;
  return {
    id: `entry-${String(sequence)}`,
    entityType,
    entityId,
    occurredAt: new Date(at),
    actorId: CAMILA,
    source: 'gestion',
    action,
    changes,
  };
}

const priceChange = (from: bigint, to: bigint) => ({
  operations: {
    before: [{ operation: 'sale', currency: 'USD', priceCents: from }],
    after: [{ operation: 'sale', currency: 'USD', priceCents: to }],
  },
});

function setup(entries: InMemoryNewsEntry[], scope: 'branch' | 'all' = 'all') {
  const feed = new InMemoryNewsFeedQuery(
    entries,
    new Map([
      [PROPERTY, { header: propertyHeader, branchId: NORTH }],
      [OTHER_PROPERTY, { header: propertyHeader, branchId: SOUTH }],
      [CLIENT, { header: clientHeader, branchId: NORTH }],
    ]),
  );
  const users = new InMemoryNewsUserNames(
    new Map([
      [CAMILA, 'Camila'],
      [PEDRO, 'Pedro'],
    ]),
  );
  const listNews = new ListNews({ feed, settings: new FixedNewsScope(scope), users });
  return { listNews, feed, users };
}

describe('ListNews', () => {
  it('groups the news by entity and day, newest card first, with the author', async () => {
    const { listNews } = setup([
      entry(
        'property',
        PROPERTY,
        'property.updated',
        '2026-10-03T18:00:00Z',
        priceChange(12_000_000n, 1_280_000n),
      ),
      entry(
        'property',
        PROPERTY,
        'property.updated',
        '2026-10-03T18:05:00Z',
        priceChange(1_280_000n, 12_800_000n),
      ),
      entry('client', CLIENT, 'client.created', '2026-10-03T15:52:00Z'),
      entry('property', PROPERTY, 'property.media_added', '2026-10-03T19:00:00Z'),
    ]);

    const page = unwrap(await listNews.execute({}, reader));

    expect(page.total).toBe(2);
    expect(page.items.map((card) => [card.entityType, card.day, card.entries.length])).toEqual([
      ['property', '2026-10-03', 2],
      ['client', '2026-10-03', 1],
    ]);
    const [property] = page.items;
    expect(property?.header).toEqual(propertyHeader);
    expect(property?.entries[0]).toMatchObject({
      kind: 'property.price_changed',
      actor: { id: CAMILA, name: 'Camila' },
      assignee: undefined,
    });
    expect(property?.moreCount).toBe(0);
  });

  it('splits an entity into one card per day in Buenos Aires', async () => {
    const { listNews } = setup([
      // 01:00 UTC del 4 es todavía el 3 en Buenos Aires.
      entry('client', CLIENT, 'client.created', '2026-10-04T01:00:00Z'),
      entry('client', CLIENT, 'client.reassigned', '2026-10-04T04:00:00Z', {
        agentId: { before: CAMILA, after: PEDRO },
      }),
    ]);

    const page = unwrap(await listNews.execute({}, reader));

    expect(page.items.map((card) => card.day)).toEqual(['2026-10-04', '2026-10-03']);
    expect(page.items[0]?.entries[0]?.assignee).toEqual({ id: PEDRO, name: 'Pedro' });
  });

  it('shows only the selected kinds', async () => {
    const { listNews, feed } = setup([
      entry('property', PROPERTY, 'property.status_changed', '2026-10-03T12:00:00Z'),
      entry('client', CLIENT, 'client.deleted', '2026-10-03T13:00:00Z'),
    ]);

    const page = unwrap(await listNews.execute({ kinds: ['client.deleted'] }, reader));

    expect(page.items.map((card) => card.entityId)).toEqual([CLIENT]);
    expect(feed.criteria[0]?.kinds).toEqual(['client.deleted']);
  });

  it('returns an empty page without reading the feed when no kind is selected', async () => {
    const { listNews, feed } = setup([
      entry('client', CLIENT, 'client.deleted', '2026-10-03T13:00:00Z'),
    ]);

    const page = unwrap(await listNews.execute({ kinds: [] }, reader));

    expect(page.items).toEqual([]);
    expect(feed.criteria).toEqual([]);
  });

  it('shows every branch when the company scope is "all"', async () => {
    const { listNews, feed } = setup([
      entry('property', PROPERTY, 'property.created', '2026-10-03T12:00:00Z'),
      entry('property', OTHER_PROPERTY, 'property.created', '2026-10-03T13:00:00Z'),
    ]);

    const page = unwrap(await listNews.execute({}, reader));

    expect(page.total).toBe(2);
    expect(feed.criteria[0]?.branchId).toBeUndefined();
  });

  it('narrows the feed to the reader\'s branch when the company scope is "branch"', async () => {
    const { listNews, feed } = setup(
      [
        entry('property', PROPERTY, 'property.created', '2026-10-03T12:00:00Z'),
        entry('property', OTHER_PROPERTY, 'property.created', '2026-10-03T13:00:00Z'),
      ],
      'branch',
    );

    const page = unwrap(await listNews.execute({}, reader));

    expect(page.items.map((card) => card.entityId)).toEqual([PROPERTY]);
    expect(feed.criteria[0]?.branchId).toBe(NORTH);
  });

  it('shows every branch to a user without a branch, even with the "branch" scope', async () => {
    const { listNews, feed } = setup([], 'branch');

    unwrap(await listNews.execute({}, Actor.user(CAMILA, ['news:read'])));

    expect(feed.criteria[0]?.branchId).toBeUndefined();
  });

  it('paginates the cards and counts the entries left out of each one', async () => {
    const entries = Array.from({ length: 23 }, (_, index) =>
      entry(
        'property',
        PROPERTY,
        'property.status_changed',
        `2026-10-03T12:${String(index).padStart(2, '0')}:00Z`,
      ),
    );
    const { listNews, feed } = setup([
      ...entries,
      entry('client', CLIENT, 'client.created', '2026-10-02T12:00:00Z'),
    ]);

    const page = unwrap(await listNews.execute({ page: 2, pageSize: 1 }, reader));

    expect(feed.criteria[0]).toMatchObject({ offset: 1, limit: 1, entriesPerCard: 20 });
    expect(page.items.map((card) => card.entityId)).toEqual([CLIENT]);
    const first = unwrap(await listNews.execute({ page: 1, pageSize: 1 }, reader));
    expect(first.items[0]?.entries).toHaveLength(20);
    expect(first.items[0]?.moreCount).toBe(3);
  });

  it('rejects an invalid query', async () => {
    const { listNews } = setup([]);

    const error = unwrapErr(await listNews.execute({ pageSize: 999 }, reader));

    expect(error.type).toBe('InvalidInput');
  });

  it('forbids users without news:read', async () => {
    const { listNews, feed } = setup([]);

    const error = unwrapErr(await listNews.execute({}, Actor.user(CAMILA, ['audit:read'])));

    expect(error).toEqual({ type: 'Forbidden' });
    expect(feed.criteria).toEqual([]);
  });
});
