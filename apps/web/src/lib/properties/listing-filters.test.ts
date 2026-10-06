import { describe, expect, it } from 'vitest';

import {
  activeFilterCount,
  isIndexable,
  listingHref,
  listingTitle,
  parseListingFilters,
  priceCurrency,
  toSearchInput,
} from './listing-filters';

describe('parseListingFilters', () => {
  it('reads every filter from the Spanish query params', () => {
    expect(
      parseListingFilters({
        operacion: 'venta',
        tipo: 'departamento',
        zona: ' Mataderos ',
        moneda: 'usd',
        desde: '80.000',
        hasta: '150000',
        ambientes: '3',
        dormitorios: '2',
        orden: 'menor-precio',
        pagina: '2',
      }),
    ).toEqual({
      operation: 'sale',
      propertyType: 'apartment',
      location: 'Mataderos',
      currency: 'USD',
      minPrice: 80_000,
      maxPrice: 150_000,
      minRooms: 3,
      minBedrooms: 2,
      sort: 'price_asc',
      page: 2,
    });
  });

  it('ignores invalid values instead of failing', () => {
    expect(
      parseListingFilters({
        operacion: 'permuta',
        tipo: ['casa', 'ph'],
        desde: '-5',
        hasta: 'mucho',
        ambientes: '0',
        orden: 'random',
        pagina: '9999',
      }),
    ).toEqual({ propertyType: 'house', sort: 'featured', page: 1 });
  });
});

describe('toSearchInput', () => {
  it('turns prices into cents in the currency of the operation', () => {
    const filters = parseListingFilters({ operacion: 'alquiler', hasta: '500000' });
    expect(priceCurrency(filters)).toBe('ARS');
    expect(toSearchInput(filters, 12)).toEqual({
      operation: 'rent',
      currency: 'ARS',
      maxPriceCents: 50_000_000n,
      sort: 'featured',
      page: 1,
      pageSize: 12,
    });
  });

  it('sends no currency without a price filter', () => {
    expect(toSearchInput(parseListingFilters({ moneda: 'usd' }), 12)).toEqual({
      sort: 'featured',
      page: 1,
      pageSize: 12,
    });
  });
});

describe('listingHref', () => {
  const filters = parseListingFilters({ operacion: 'venta', zona: 'Liniers', pagina: '3' });

  it('keeps the filters and goes back to the first page when one changes', () => {
    expect(listingHref(filters, { minRooms: 2 })).toBe(
      '/propiedades?operacion=venta&zona=Liniers&ambientes=2',
    );
  });

  it('writes the page and the sort only when they are not the default', () => {
    expect(listingHref(filters, { page: 4, sort: 'newest' })).toBe(
      '/propiedades?operacion=venta&zona=Liniers&orden=recientes&pagina=4',
    );
    expect(listingHref(parseListingFilters({}))).toBe('/propiedades');
  });

  it('removes a filter set to undefined', () => {
    expect(listingHref(filters, { location: undefined })).toBe('/propiedades?operacion=venta');
  });

  it('counts the filters the person chose', () => {
    expect(activeFilterCount(filters)).toBe(2);
  });
});

describe('listingTitle', () => {
  it('names what, how and where', () => {
    expect(
      listingTitle(parseListingFilters({ operacion: 'venta', tipo: 'ph', zona: 'Liniers' })),
    ).toBe('PH en venta en Liniers');
    expect(listingTitle(parseListingFilters({ tipo: 'casa' }))).toBe('Casas en venta y alquiler');
    expect(listingTitle(parseListingFilters({ zona: 'ramos mejía' }))).toBe(
      'Propiedades en venta y alquiler en Ramos Mejía',
    );
    expect(listingTitle(parseListingFilters({}))).toBe('Propiedades en venta y alquiler');
  });

  it('indexes operation, type, zone and page, but not the fine filters', () => {
    expect(isIndexable(parseListingFilters({ operacion: 'venta', zona: 'x', pagina: '2' }))).toBe(
      true,
    );
    expect(isIndexable(parseListingFilters({ ambientes: '2' }))).toBe(false);
    expect(isIndexable(parseListingFilters({ orden: 'recientes' }))).toBe(false);
  });
});
