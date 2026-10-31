import { describe, expect, it } from 'vitest';

import { ACTIVITY_AREAS } from '../domain/activity';
import { NEWS_KINDS } from '../domain/news';
import {
  ACTIVITY_AREA_VALUES,
  ListMyActivityQuerySchema,
  NEWS_KIND_VALUES,
  NEWS_MAX_PAGE_SIZE,
  NewsFeedQuerySchema,
} from './index';

describe('news contracts', () => {
  it('lists the same kinds as the domain', () => {
    expect(NEWS_KIND_VALUES).toEqual(NEWS_KINDS);
  });

  it('defaults to every kind, newest first', () => {
    const query = NewsFeedQuerySchema.parse({});
    expect(query.kinds).toEqual([...NEWS_KIND_VALUES]);
    expect(query.sort).toEqual({ field: 'occurredAt', direction: 'desc' });
  });

  it('rejects unknown kinds and pages that are too big', () => {
    expect(NewsFeedQuerySchema.safeParse({ kinds: ['property.media_added'] }).success).toBe(false);
    expect(NewsFeedQuerySchema.safeParse({ pageSize: NEWS_MAX_PAGE_SIZE + 1 }).success).toBe(false);
  });
});

describe('activity contracts', () => {
  it('lists the same areas as the domain', () => {
    expect(ACTIVITY_AREA_VALUES).toEqual(ACTIVITY_AREAS);
  });

  it('defaults to newest first, every area', () => {
    const query = ListMyActivityQuerySchema.parse({});
    expect(query.sort).toEqual({ field: 'occurredAt', direction: 'desc' });
    expect(query.area).toBeUndefined();
  });

  it('rejects unknown areas, bad dates and pages that are too big', () => {
    expect(ListMyActivityQuerySchema.safeParse({ area: 'cash' }).success).toBe(false);
    expect(ListMyActivityQuerySchema.safeParse({ from: '31/10/2026' }).success).toBe(false);
    expect(ListMyActivityQuerySchema.safeParse({ pageSize: 51 }).success).toBe(false);
  });
});
