import { describe, expect, it } from 'vitest';

import { chatListingHref } from './listing-link';

const EMPTY = {
  operation: null,
  propertyType: null,
  location: null,
  currency: null,
  minPrice: null,
  maxPrice: null,
  minRooms: null,
  minBedrooms: null,
  total: 12,
};

describe('chatListingHref', () => {
  it('turns the search of the agent into the listing URL with its filters', () => {
    const href = chatListingHref({
      ...EMPTY,
      operation: 'sale',
      propertyType: 'apartment',
      location: 'Villa Urquiza',
      currency: 'USD',
      maxPrice: 200_000,
      minRooms: 2,
    });

    expect(href).toBe(
      '/propiedades?operacion=venta&tipo=departamento&zona=Villa+Urquiza&moneda=usd&hasta=200000&ambientes=2',
    );
  });

  it('links the whole listing when the search has no filters', () => {
    expect(chatListingHref(EMPTY)).toBe('/propiedades');
  });

  it('drops unknown or invalid values', () => {
    expect(
      chatListingHref({ ...EMPTY, operation: 'barter', propertyType: 'castle', minRooms: -1 }),
    ).toBe('/propiedades');
  });
});
