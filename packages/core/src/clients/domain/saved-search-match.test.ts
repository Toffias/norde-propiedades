import { describe, expect, it } from 'vitest';

import {
  matchesSavedSearch,
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
