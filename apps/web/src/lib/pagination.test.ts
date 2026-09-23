import { describe, expect, it } from 'vitest';

import { paginationItems, parsePageParam, POSTS_PER_PAGE, totalPages } from './pagination';

describe('totalPages', () => {
  it('uses the same page size that the listing shows', () => {
    expect(totalPages(POSTS_PER_PAGE)).toBe(1);
    expect(totalPages(POSTS_PER_PAGE + 1)).toBe(2);
  });

  it('always has at least one page', () => {
    expect(totalPages(0)).toBe(1);
  });
});

describe('parsePageParam', () => {
  it('accepts pages from 2 on', () => {
    expect(parsePageParam('2')).toBe(2);
    expect(parsePageParam('15')).toBe(15);
  });

  it('rejects page 1 (it lives in the base route) and non canonical values', () => {
    for (const value of ['1', '0', '-2', '02', '2.5', 'abc', '', '99999']) {
      expect(parsePageParam(value)).toBeUndefined();
    }
  });
});

describe('paginationItems', () => {
  it('lists every page when there are few', () => {
    expect(paginationItems(2, 3)).toEqual([
      { type: 'page', page: 1, current: false },
      { type: 'page', page: 2, current: true },
      { type: 'page', page: 3, current: false },
    ]);
  });

  it('adds ellipses between the first, the neighbours of the current and the last page', () => {
    const items = paginationItems(5, 10).map((i) => (i.type === 'page' ? i.page : '…'));
    expect(items).toEqual([1, '…', 4, 5, 6, '…', 10]);
  });
});
