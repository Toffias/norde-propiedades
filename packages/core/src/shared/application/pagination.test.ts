import { describe, expect, it } from 'vitest';

import { toOffsetLimit, toPage } from './pagination';

describe('toOffsetLimit', () => {
  it('starts the first page at offset zero', () => {
    expect(toOffsetLimit({ page: 1, pageSize: 20 })).toEqual({ offset: 0, limit: 20 });
  });

  it('skips the rows of the previous pages', () => {
    expect(toOffsetLimit({ page: 3, pageSize: 50 })).toEqual({ offset: 100, limit: 50 });
  });
});

describe('toPage', () => {
  it('keeps the slice and the requested page', () => {
    expect(toPage({ items: ['a', 'b'], total: 42 }, { page: 2, pageSize: 2 })).toEqual({
      items: ['a', 'b'],
      total: 42,
      page: 2,
      pageSize: 2,
    });
  });
});
