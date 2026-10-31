import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, unwrap, unwrapErr } from '../../../shared/testing';
import type { NewsHeader } from '../../contracts';
import { FixedNewsScope, InMemoryNewsFeedQuery, type InMemoryNewsEntry } from '../../testing';
import { GetNewsActivity } from './get-news-activity';

const CAMILA = '01900000-0000-7000-8000-0000000000a1';
const PROPERTY = '01900000-0000-7000-8000-0000000000b1';
const OTHER_PROPERTY = '01900000-0000-7000-8000-0000000000b2';
const CLIENT = '01900000-0000-7000-8000-0000000000c1';
const NORTH = '01900000-0000-7000-8000-0000000000d1';
const SOUTH = '01900000-0000-7000-8000-0000000000d2';

// 01:30 UTC del 6 de octubre: en Buenos Aires todavía es el 5.
const clock = new FixedClock('2026-10-06T01:30:00Z');
const reader = Actor.user(CAMILA, ['news:read']).withBranch(NORTH);

const header: NewsHeader = { entityType: 'client', name: 'Ana', tags: [], deleted: false };

let sequence = 0;
function entry(
  entityType: 'property' | 'client',
  entityId: string,
  action: string,
  at: string,
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
    changes: {},
  };
}

function setup(entries: InMemoryNewsEntry[], scope: 'branch' | 'all' = 'all') {
  const feed = new InMemoryNewsFeedQuery(
    entries,
    new Map([
      [PROPERTY, { header, branchId: NORTH }],
      [OTHER_PROPERTY, { header, branchId: SOUTH }],
      [CLIENT, { header, branchId: NORTH }],
    ]),
  );
  return {
    feed,
    activity: new GetNewsActivity({ feed, settings: new FixedNewsScope(scope), clock }),
  };
}

describe('GetNewsActivity', () => {
  it('counts the cards of each of the last 7 days, with zero on quiet days', async () => {
    const { activity, feed } = setup([
      entry('property', PROPERTY, 'property.created', '2026-10-05T12:00:00Z'),
      // Mismo día y tipo: es una sola tarjeta.
      entry('property', PROPERTY, 'property.status_changed', '2026-10-05T13:00:00Z'),
      entry('property', PROPERTY, 'property.status_changed', '2026-10-05T14:00:00Z'),
      entry('client', CLIENT, 'client.created', '2026-10-06T01:00:00Z'),
      entry('client', CLIENT, 'client.deleted', '2026-10-01T12:00:00Z'),
      // 23:30 del 28 en Buenos Aires: fuera de la semana.
      entry('client', CLIENT, 'client.created', '2026-09-29T02:30:00Z'),
    ]);

    const result = unwrap(await activity.execute({}, reader));

    expect(result.days).toEqual([
      { day: '2026-09-29', count: 0 },
      { day: '2026-09-30', count: 0 },
      { day: '2026-10-01', count: 1 },
      { day: '2026-10-02', count: 0 },
      { day: '2026-10-03', count: 0 },
      { day: '2026-10-04', count: 0 },
      { day: '2026-10-05', count: 3 },
    ]);
    expect(feed.activityCriteria[0]?.days).toEqual({ from: '2026-09-29', to: '2026-10-05' });
  });

  it('counts only the selected kinds', async () => {
    const { activity } = setup([
      entry('property', PROPERTY, 'property.created', '2026-10-05T12:00:00Z'),
      entry('client', CLIENT, 'client.created', '2026-10-05T12:00:00Z'),
    ]);

    const result = unwrap(await activity.execute({ kinds: ['client.created'] }, reader));

    expect(result.days.at(-1)).toEqual({ day: '2026-10-05', count: 1 });
  });

  it('returns zeros without reading the feed when no kind is selected', async () => {
    const { activity, feed } = setup([
      entry('client', CLIENT, 'client.created', '2026-10-05T12:00:00Z'),
    ]);

    const result = unwrap(await activity.execute({ kinds: [] }, reader));

    expect(result.days.every((day) => day.count === 0)).toBe(true);
    expect(feed.activityCriteria).toEqual([]);
  });

  it('narrows the count to the reader\'s branch when the company scope is "branch"', async () => {
    const { activity, feed } = setup(
      [
        entry('property', PROPERTY, 'property.created', '2026-10-05T12:00:00Z'),
        entry('property', OTHER_PROPERTY, 'property.created', '2026-10-05T12:00:00Z'),
      ],
      'branch',
    );

    const result = unwrap(await activity.execute({}, reader));

    expect(feed.activityCriteria[0]?.branchId).toBe(NORTH);
    expect(result.days.at(-1)?.count).toBe(1);
  });

  it('rejects an invalid query', async () => {
    const { activity } = setup([]);

    // @ts-expect-error: un tipo de noticia que no existe.
    const error = unwrapErr(await activity.execute({ kinds: ['property.sold'] }, reader));

    expect(error.type).toBe('InvalidInput');
  });

  it('forbids users without news:read', async () => {
    const { activity, feed } = setup([]);

    const error = unwrapErr(await activity.execute({}, Actor.user(CAMILA, ['audit:read'])));

    expect(error).toEqual({ type: 'Forbidden' });
    expect(feed.activityCriteria).toEqual([]);
  });
});
