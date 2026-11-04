import { describe, expect, it } from 'vitest';

import { PUBLIC_AGE_VALUES, PUBLIC_COUNT_OPTION_LIMITS } from '../contracts';

import {
  AGE_OPTIONS,
  COUNT_OPTION_LIMITS,
  ageRange,
  countOptionRanges,
  countOptions,
  priceBoundsByCurrency,
} from './public-search';

describe('count options', () => {
  it('offers 1 to 4 rooms and 1 to 3 bedrooms and bathrooms', () => {
    expect(countOptions('rooms')).toEqual([1, 2, 3, 4]);
    expect(countOptions('bedrooms')).toEqual([1, 2, 3]);
    expect(countOptions('bathrooms')).toEqual([1, 2, 3]);
  });

  it('treats the last option as "or more" and the rest as exact', () => {
    expect(countOptionRanges('rooms', [4, 2, 2])).toEqual([{ min: 2, max: 2 }, { min: 4 }]);
    expect(countOptionRanges('bedrooms', [3, 1])).toEqual([{ min: 1, max: 1 }, { min: 3 }]);
  });
});

describe('ageRange', () => {
  it('maps each option to its years', () => {
    expect(ageRange('brand_new')).toEqual({ kind: 'brand_new' });
    expect(ageRange('up_to_5')).toEqual({ kind: 'years', max: 5 });
    expect(ageRange('up_to_20')).toEqual({ kind: 'years', max: 20 });
    expect(ageRange('over_20')).toEqual({ kind: 'years', min: 21 });
  });
});

describe('priceBoundsByCurrency', () => {
  const rate = 145_000n; // $1.450 por dólar

  it('only searches the requested currency without an exchange rate', () => {
    const bounds = { currency: 'ARS' as const, maxCents: 100_000_000_000n };
    expect(priceBoundsByCurrency(bounds, undefined)).toEqual([bounds]);
  });

  it('includes dollar prices that fit a peso range', () => {
    // Hasta $100.000.000 → hasta 68.965,51 USD: 60.000 USD entra.
    const [, usd] = priceBoundsByCurrency({ currency: 'ARS', maxCents: 10_000_000_000n }, rate);
    expect(usd).toEqual({ currency: 'USD', maxCents: 6_896_551n });
  });

  it('includes peso prices that fit a dollar range, rounding the minimum up', () => {
    const [, ars] = priceBoundsByCurrency(
      { currency: 'USD', minCents: 5_000_000n, maxCents: 10_000_000n },
      rate,
    );
    expect(ars).toEqual({ currency: 'ARS', minCents: 7_250_000_000n, maxCents: 14_500_000_000n });
  });

  it('rounds the converted minimum up so a cheaper property does not sneak in', () => {
    const [, usd] = priceBoundsByCurrency({ currency: 'ARS', minCents: 100n }, 145_001n);
    // 100 × 100 / 145.001 = 0,07 → 1 centavo de dólar.
    expect(usd).toEqual({ currency: 'USD', minCents: 1n });
  });
});

describe('contract options', () => {
  it('match the domain rules', () => {
    expect(PUBLIC_COUNT_OPTION_LIMITS).toEqual(COUNT_OPTION_LIMITS);
    expect(PUBLIC_AGE_VALUES).toEqual(AGE_OPTIONS);
  });
});
