import { describe, expect, it } from 'vitest';

import {
  developmentPriceFrom,
  isDevelopmentPubliclyListed,
  placeFromPath,
} from './public-development';

describe('isDevelopmentPubliclyListed', () => {
  it('lists the developments being marketed', () => {
    expect(isDevelopmentPubliclyListed({ status: 'marketing', deletedAt: null })).toBe(true);
  });

  it('hides the ones still loading information', () => {
    expect(isDevelopmentPubliclyListed({ status: 'loading', deletedAt: null })).toBe(false);
  });

  it('hides the ones in the trash', () => {
    expect(
      isDevelopmentPubliclyListed({ status: 'marketing', deletedAt: new Date('2026-10-01') }),
    ).toBe(false);
  });
});

describe('developmentPriceFrom', () => {
  it('takes the lowest price in dollars', () => {
    expect(
      developmentPriceFrom([
        { currency: 'USD', amountCents: 12_000_000n },
        { currency: 'USD', amountCents: 9_500_000n },
      ]),
    ).toEqual({ currency: 'USD', amountCents: 9_500_000n });
  });

  it('prefers dollars over pesos instead of comparing them', () => {
    expect(
      developmentPriceFrom([
        { currency: 'ARS', amountCents: 100n },
        { currency: 'USD', amountCents: 9_500_000n },
      ]),
    ).toEqual({ currency: 'USD', amountCents: 9_500_000n });
  });

  it('falls back to pesos when no unit is priced in dollars', () => {
    expect(developmentPriceFrom([{ currency: 'ARS', amountCents: 5_000n }])).toEqual({
      currency: 'ARS',
      amountCents: 5_000n,
    });
  });

  it('has no price when no unit shows one', () => {
    expect(developmentPriceFrom([])).toBeUndefined();
  });
});

describe('placeFromPath', () => {
  it('takes the neighborhood, city and province from the location path', () => {
    expect(
      placeFromPath([
        { kind: 'country', name: 'Argentina' },
        { kind: 'province', name: 'Buenos Aires' },
        { kind: 'city', name: 'Vicente López' },
        { kind: 'neighborhood', name: 'Olivos' },
      ]),
    ).toEqual({ neighborhood: 'Olivos', city: 'Vicente López', province: 'Buenos Aires' });
  });

  it('uses the sub-neighborhood when there is one', () => {
    expect(
      placeFromPath([
        { kind: 'city', name: 'CABA' },
        { kind: 'neighborhood', name: 'Palermo' },
        { kind: 'subneighborhood', name: 'Palermo Soho' },
      ]).neighborhood,
    ).toBe('Palermo Soho');
  });

  it('leaves empty the levels the location does not reach', () => {
    expect(placeFromPath([{ kind: 'province', name: 'Córdoba' }])).toEqual({
      neighborhood: '',
      city: '',
      province: 'Córdoba',
    });
  });
});
