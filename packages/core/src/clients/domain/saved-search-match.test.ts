import { describe, expect, it } from 'vitest';

import {
  bestMatchScore,
  matchesSavedSearch,
  matchScore,
  type MatchableProperty,
  type MatchableSearch,
} from './saved-search-match';

const PALERMO = 'loc-palermo';
const CABA = 'loc-caba';

const property: MatchableProperty = {
  propertyType: 'apartment',
  operations: [{ operation: 'sale', currency: 'USD', priceCents: 12_000_000n }],
  locationIds: ['loc-ar', CABA, PALERMO],
  rooms: 3,
};

const search: MatchableSearch = {
  operation: 'sale',
  propertyTypes: [],
  currency: undefined,
  minPriceCents: undefined,
  maxPriceCents: undefined,
  locationIds: [],
  minRooms: undefined,
};

describe('matchesSavedSearch', () => {
  it('matches a search without filters of the same operation', () => {
    expect(matchesSavedSearch(property, search)).toBe(true);
    expect(matchesSavedSearch(property, { ...search, operation: 'rent' })).toBe(false);
  });

  it('checks the type, the location (or an ancestor) and the minimum rooms', () => {
    expect(matchesSavedSearch(property, { ...search, propertyTypes: ['house'] })).toBe(false);
    expect(matchesSavedSearch(property, { ...search, locationIds: [CABA] })).toBe(true);
    expect(matchesSavedSearch(property, { ...search, locationIds: ['loc-belgrano'] })).toBe(false);
    expect(matchesSavedSearch(property, { ...search, minRooms: 4 })).toBe(false);
    expect(matchesSavedSearch({ ...property, rooms: undefined }, { ...search, minRooms: 1 })).toBe(
      false,
    );
  });

  it('checks the price range in the same currency', () => {
    const range = {
      ...search,
      currency: 'USD',
      minPriceCents: 10_000_000n,
      maxPriceCents: 12_000_000n,
    };
    expect(matchesSavedSearch(property, range)).toBe(true);
    expect(matchesSavedSearch(property, { ...range, maxPriceCents: 11_999_999n })).toBe(false);
    expect(matchesSavedSearch(property, { ...range, currency: 'ARS' })).toBe(false);
    const onRequest: MatchableProperty = {
      ...property,
      operations: [{ operation: 'sale', currency: 'USD', priceCents: undefined }],
    };
    expect(matchesSavedSearch(onRequest, range)).toBe(false);
    expect(matchesSavedSearch(onRequest, search)).toBe(true);
  });
});

describe('matchScore', () => {
  const full: MatchableSearch = {
    operation: 'sale',
    propertyTypes: ['apartment'],
    currency: 'USD',
    minPriceCents: 10_000_000n,
    maxPriceCents: 12_000_000n,
    locationIds: [CABA],
    minRooms: 3,
  };

  it('is 0 without the operation and 100 when every criterion is met', () => {
    expect(matchScore(property, { ...full, operation: 'rent' })).toBe(0);
    expect(matchScore(property, full)).toBe(100);
    expect(matchScore(property, search)).toBe(100);
  });

  it('counts the share of the defined criteria that are met', () => {
    expect(matchScore(property, { ...full, propertyTypes: ['house'] })).toBe(80);
    expect(matchScore(property, { ...full, propertyTypes: ['house'], minRooms: 4 })).toBe(60);
    expect(matchScore(property, { ...search, locationIds: ['loc-belgrano'] })).toBe(50);
    expect(matchScore(property, { ...full, currency: 'ARS' })).toBe(80);
    const onRequest: MatchableProperty = {
      ...property,
      operations: [{ operation: 'sale', currency: 'USD', priceCents: undefined }],
    };
    expect(matchScore(onRequest, full)).toBe(80);
    expect(matchScore({ ...property, rooms: undefined }, { ...search, minRooms: 1 })).toBe(50);
  });

  it('is 100 exactly when the search matches', () => {
    const variants: MatchableSearch[] = [
      full,
      search,
      { ...full, maxPriceCents: 11_999_999n },
      { ...full, locationIds: ['loc-belgrano'] },
      { ...full, currency: 'ARS' },
      { ...search, minRooms: 4 },
      { ...search, propertyTypes: ['house', 'apartment'] },
    ];
    for (const variant of variants) {
      expect(matchScore(property, variant) === 100).toBe(matchesSavedSearch(property, variant));
    }
  });
});

describe('bestMatchScore', () => {
  it('takes the best search, and none without searches', () => {
    expect(bestMatchScore(property, [])).toBeUndefined();
    expect(
      bestMatchScore(property, [
        { ...search, operation: 'rent' },
        { ...search, minRooms: 4 },
      ]),
    ).toBe(50);
  });
});
