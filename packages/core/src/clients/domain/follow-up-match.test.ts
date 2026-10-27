import { describe, expect, it } from 'vitest';

import { followUpPrice, isPriceDrop } from './follow-up-match';

describe('isPriceDrop', () => {
  it('is a drop only when both prices are known and the new one is lower', () => {
    expect(isPriceDrop(12_000_000n, 11_500_000n)).toBe(true);
    expect(isPriceDrop(12_000_000n, 12_000_000n)).toBe(false);
    expect(isPriceDrop(12_000_000n, 13_000_000n)).toBe(false);
  });

  it('ignores a change without the previous or the new price', () => {
    expect(isPriceDrop(undefined, 11_500_000n)).toBe(false);
    expect(isPriceDrop(12_000_000n, undefined)).toBe(false);
  });
});

describe('followUpPrice', () => {
  const operations = [
    { operation: 'sale', currency: 'USD', priceCents: 12_000_000n },
    { operation: 'rent', currency: 'ARS', priceCents: undefined },
  ];

  it('takes the price of the matched operation', () => {
    expect(followUpPrice(operations, 'sale')).toEqual({
      operation: 'sale',
      currency: 'USD',
      priceCents: 12_000_000n,
    });
    expect(followUpPrice(operations, 'rent')?.priceCents).toBeUndefined();
    expect(followUpPrice(operations, 'temporary_rent')).toBeUndefined();
  });
});
