import { describe, expect, it } from 'vitest';

import type { ListingFilters } from '../properties/listing-filters';

import { ignoredFilters, subscriptionCriteria, subscriptionSummary } from './search-subscription';

const BASE: ListingFilters = { sort: 'featured', page: 1 };
const PALERMO = '00000000-0000-7000-8000-0000000000c1';

describe('subscriptionCriteria', () => {
  it('keeps what the saved search can match', () => {
    expect(
      subscriptionCriteria({
        ...BASE,
        operation: 'sale',
        propertyTypes: ['apartment', 'ph'],
        locationIds: [PALERMO],
        currency: 'ARS',
        maxPrice: 150_000,
        rooms: [3, 2],
      }),
    ).toEqual({
      operation: 'sale',
      propertyTypes: ['apartment', 'ph'],
      locationIds: [PALERMO],
      currency: 'ARS',
      minPrice: undefined,
      maxPrice: 150_000,
      minRooms: 2,
    });
  });

  it('uses the usual currency of the operation for a price without currency', () => {
    expect(subscriptionCriteria({ ...BASE, minPrice: 80_000 })).toMatchObject({
      operation: undefined,
      currency: 'USD',
    });
    expect(subscriptionCriteria({ ...BASE, operation: 'rent', maxPrice: 900_000 }).currency).toBe(
      'ARS',
    );
    expect(subscriptionCriteria(BASE).currency).toBeUndefined();
  });
});

describe('ignoredFilters', () => {
  it('lists the applied filters the subscription does not keep', () => {
    expect(
      ignoredFilters({
        ...BASE,
        location: 'ramos',
        bedrooms: [2],
        minArea: 50,
        parking: true,
        featureIds: ['x'],
      }),
    ).toEqual([
      'la zona escrita a mano',
      'dormitorios',
      'superficie',
      'cochera',
      'características',
    ]);
    expect(ignoredFilters({ ...BASE, operation: 'rent', rooms: [2] })).toEqual([]);
  });
});

describe('subscriptionSummary', () => {
  it('titles the search with price and rooms', () => {
    expect(
      subscriptionSummary(
        {
          operation: 'sale',
          propertyTypes: ['apartment'],
          locationIds: [PALERMO],
          currency: 'USD',
          minPrice: 100_000,
          maxPrice: 150_000,
          minRooms: 2,
        },
        ['Palermo'],
      ),
    ).toBe('Departamentos en venta en Palermo, de USD 100.000 a USD 150.000, desde 2 ambientes');
  });

  it('titles a search without filters', () => {
    expect(
      subscriptionSummary(
        {
          operation: 'rent',
          propertyTypes: [],
          locationIds: [],
          currency: undefined,
          minPrice: undefined,
          maxPrice: undefined,
          minRooms: undefined,
        },
        [],
      ),
    ).toBe('Propiedades en alquiler');
  });
});
