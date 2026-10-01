import { describe, expect, it } from 'vitest';

import { pageCount } from './pagination';

describe('pageCount', () => {
  it('rounds up a partial last page', () => {
    expect(pageCount(21, 10)).toBe(3);
  });

  it('is exact when the total fills the pages', () => {
    expect(pageCount(20, 10)).toBe(2);
  });

  it('never returns less than one page', () => {
    expect(pageCount(0, 10)).toBe(1);
  });
});
