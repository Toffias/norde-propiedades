import { describe, expect, it } from 'vitest';

import { weightShares } from './weight-shares';

describe('weightShares', () => {
  it('splits the inquiries by weight', () => {
    expect(weightShares([2, 1])).toEqual([67, 33]);
    expect(weightShares([1, 1, 1, 1])).toEqual([25, 25, 25, 25]);
    expect(weightShares([])).toEqual([]);
  });
});
