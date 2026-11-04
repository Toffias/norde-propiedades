import { describe, expect, it } from 'vitest';

import {
  activeFilters,
  activeFilterCount,
  isIndexable,
  listingHref,
  listingTitle,
  operationHref,
  parseListingFilters,
  priceCurrency,
  toMapInput,
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
        ambientes: ['3', '1', '3'],
        dormitorios: '2',
        banos: '3',
        'm2-desde': '40',
        'm2-hasta': '1.200',
        antiguedad: 'hasta-10',
        amoblado: 'si',
        cochera: 'si',
        orden: 'menor-precio',
        pagina: '2',
      }),
    ).toEqual({
      operation: 'sale',
      propertyTypes: ['apartment'],
      location: 'Mataderos',
      currency: 'USD',
      minPrice: 80_000,
      maxPrice: 150_000,
      rooms: [3, 1],
      bedrooms: [2],
      bathrooms: [3],
      minArea: 40,
      maxArea: 1_200,
      age: 'up_to_10',
      furnished: true,
      parking: true,
      sort: 'price_asc',
      page: 2,
    });
  });

  it('ignores invalid values instead of failing', () => {
    expect(
      parseListingFilters({
        operacion: 'permuta',
        tipo: ['castillo', 'casa', 'casa'],
        desde: '-5',
        hasta: 'mucho',
        ambientes: ['0', '5'],
        dormitorios: '4',
        antiguedad: 'vieja',
        amoblado: 'no',
        caracteristica: 'pileta',
        orden: 'random',
        pagina: '9999',
      }),
    ).toEqual({ propertyTypes: ['house'], sort: 'featured', page: 1 });
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
    // Sin precio, la moneda tampoco va en el link: una sola URL por búsqueda.
    expect(listingHref(parseListingFilters({ moneda: 'usd' }))).toBe('/propiedades');
  });
});

describe('listingHref', () => {
  const filters = parseListingFilters({ operacion: 'venta', zona: 'Liniers', pagina: '3' });

  it('keeps the filters and goes back to the first page when one changes', () => {
    expect(listingHref(filters, { rooms: [2, 4] })).toBe(
      '/propiedades?operacion=venta&zona=Liniers&ambientes=2&ambientes=4',
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

describe('catalog location, map area and view', () => {
  const PALERMO = '0192aaaa-0000-7000-8001-00000000001b';

  it('prefers the catalog location over the free text, and ignores an invalid id', () => {
    expect(parseListingFilters({ ubicacion: PALERMO, zona: 'palermo' })).toMatchObject({
      locationIds: [PALERMO],
    });
    expect(parseListingFilters({ ubicacion: PALERMO }).location).toBeUndefined();
    expect(parseListingFilters({ ubicacion: 'palermo', zona: 'palermo' })).toEqual({
      location: 'palermo',
      sort: 'featured',
      page: 1,
    });
  });

  it('reads a valid area rounded to four decimals and drops an invalid one', () => {
    expect(parseListingFilters({ area: '-34.612345,-58.5,-34.5,-58.4' }).area).toEqual({
      south: -34.6123,
      west: -58.5,
      north: -34.5,
      east: -58.4,
    });
    for (const area of ['-34.5,-58.5,-34.6,-58.4', '1,2,3', 'a,b,c,d', '-95,-58.5,-34.5,-58.4']) {
      expect(parseListingFilters({ area }).area).toBeUndefined();
    }
  });

  it('round-trips the location, area and map view in the link', () => {
    const filters = parseListingFilters({
      ubicacion: PALERMO,
      area: '-34.6,-58.5,-34.5,-58.4',
      vista: 'mapa',
    });

    expect(listingHref(filters)).toBe(
      `/propiedades?ubicacion=${PALERMO}&area=-34.6%2C-58.5%2C-34.5%2C-58.4&vista=mapa`,
    );
    expect(listingHref(filters, { view: undefined, area: undefined })).toBe(
      `/propiedades?ubicacion=${PALERMO}`,
    );
    expect(activeFilterCount(filters)).toBe(2);
  });

  it('sends the location id and the area to the search and the map', () => {
    const filters = parseListingFilters({
      ubicacion: PALERMO,
      area: '-34.6,-58.5,-34.5,-58.4',
      ambientes: '2',
      orden: 'recientes',
    });
    const area = { south: -34.6, west: -58.5, north: -34.5, east: -58.4 };

    expect(toMapInput(filters)).toEqual({ locationIds: [PALERMO], area, rooms: [2] });
    expect(toSearchInput(filters, 12)).toEqual({
      locationIds: [PALERMO],
      area,
      rooms: [2],
      sort: 'newest',
      page: 1,
      pageSize: 12,
    });
  });

  it('titles the listing with the catalog name and does not index the map', () => {
    expect(listingTitle(parseListingFilters({ ubicacion: PALERMO }), ['Palermo'])).toBe(
      'Propiedades en venta y alquiler en Palermo',
    );
    expect(isIndexable(parseListingFilters({ ubicacion: PALERMO }))).toBe(true);
    expect(isIndexable(parseListingFilters({ vista: 'mapa' }))).toBe(false);
    expect(isIndexable(parseListingFilters({ area: '-34.6,-58.5,-34.5,-58.4' }))).toBe(false);
  });
});

describe('several locations, web options and chips', () => {
  const MATADEROS = '0192aaaa-0000-7000-8001-0000000000a1';
  const LINIERS = '0192aaaa-0000-7000-8001-0000000000a2';
  const POOL = '0192aaaa-0000-7000-8002-0000000000b1';

  it('reads several locations and features, and round-trips them', () => {
    const filters = parseListingFilters({
      ubicacion: [MATADEROS, LINIERS, 'x'],
      caracteristica: [POOL],
    });

    expect(filters).toMatchObject({ locationIds: [MATADEROS, LINIERS], featureIds: [POOL] });
    expect(listingHref(filters)).toBe(
      `/propiedades?ubicacion=${MATADEROS}&ubicacion=${LINIERS}&caracteristica=${POOL}`,
    );
    expect(toMapInput(filters)).toEqual({
      locationIds: [MATADEROS, LINIERS],
      featureIds: [POOL],
    });
  });

  it('titles with every location and indexes only one', () => {
    const two = parseListingFilters({ operacion: 'venta', ubicacion: [MATADEROS, LINIERS] });
    expect(listingTitle(two, ['Mataderos', 'Liniers'])).toBe(
      'Propiedades en venta en Mataderos y Liniers',
    );
    expect(isIndexable(two)).toBe(false);
    expect(isIndexable(parseListingFilters({ ubicacion: MATADEROS }))).toBe(true);
    expect(isIndexable(parseListingFilters({ amoblado: 'si' }))).toBe(false);
  });

  it('sends the web options to the search', () => {
    const filters = parseListingFilters({
      ambientes: ['1', '4'],
      banos: '2',
      'm2-desde': '50',
      antiguedad: 'a-estrenar',
      amoblado: 'si',
      cochera: 'si',
    });
    expect(toMapInput(filters)).toEqual({
      rooms: [1, 4],
      bathrooms: [2],
      minSurfaceM2: 50,
      age: 'brand_new',
      furnished: true,
      withParking: true,
    });
  });

  it('lists the applied filters with a link that removes each one', () => {
    const filters = parseListingFilters({
      operacion: 'venta',
      tipo: 'ph',
      ubicacion: [MATADEROS, LINIERS],
      desde: '80000',
      ambientes: ['2', '4'],
      'm2-hasta': '120',
      amoblado: 'si',
      caracteristica: POOL,
    });
    const names = {
      locations: new Map([
        [MATADEROS, 'Mataderos'],
        [LINIERS, 'Liniers'],
      ]),
      features: new Map([[POOL, 'Pileta']]),
    };

    const chips = activeFilters(filters, names);

    expect(chips.map((c) => c.label)).toEqual([
      'PH',
      'Mataderos',
      'Liniers',
      'Desde USD 80.000',
      '2 ambientes',
      '4 ambientes o más',
      'Hasta 120 m²',
      'Amoblado',
      'Pileta',
    ]);
    expect(chips.find((c) => c.label === 'Mataderos')?.removeHref).toBe(
      `/propiedades?operacion=venta&tipo=ph&ubicacion=${LINIERS}&desde=80000&ambientes=2&ambientes=4&m2-hasta=120&amoblado=si&caracteristica=${POOL}`,
    );
    expect(chips.find((c) => c.key === 'rooms-2')?.removeHref).toContain('ambientes=4');
    expect(chips.find((c) => c.key === 'rooms-2')?.removeHref).not.toContain('ambientes=2');
    expect(activeFilterCount(filters)).toBe(10);
  });

  it('clears the search when the operation changes, keeping the view and the sort', () => {
    const filters = parseListingFilters({
      operacion: 'venta',
      ubicacion: MATADEROS,
      desde: '80000',
      orden: 'recientes',
      vista: 'mapa',
    });
    expect(operationHref(filters, 'rent')).toBe(
      '/propiedades?operacion=alquiler&orden=recientes&vista=mapa',
    );
    expect(operationHref(filters, undefined)).toBe('/propiedades?orden=recientes&vista=mapa');
  });
});

describe('several property types', () => {
  it('reads, writes, searches and titles every chosen type', () => {
    const filters = parseListingFilters({
      operacion: 'venta',
      tipo: ['casa', 'ph', 'departamento'],
    });

    expect(filters.propertyTypes).toEqual(['house', 'ph', 'apartment']);
    expect(listingHref(filters)).toBe(
      '/propiedades?operacion=venta&tipo=casa&tipo=ph&tipo=departamento',
    );
    expect(toMapInput(filters)).toEqual({
      operation: 'sale',
      propertyTypes: ['house', 'ph', 'apartment'],
    });
    expect(listingTitle(filters)).toBe('Casas, PH y departamentos en venta');
    expect(isIndexable(filters)).toBe(false);
    expect(isIndexable(parseListingFilters({ tipo: 'casa' }))).toBe(true);
  });

  it('shows a chip per type that removes only that one', () => {
    const filters = parseListingFilters({ tipo: ['casa', 'ph'] });
    const chips = activeFilters(filters);

    expect(chips.map((c) => c.label)).toEqual(['Casa', 'PH']);
    expect(chips[0]?.removeHref).toBe('/propiedades?tipo=ph');
  });
});
