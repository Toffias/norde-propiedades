import { describe, expect, it } from 'vitest';

import { NEWS_KINDS } from '../domain/news';
import { NEWS_KIND_VALUES, NEWS_MAX_PAGE_SIZE, NewsFeedQuerySchema } from './index';

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
