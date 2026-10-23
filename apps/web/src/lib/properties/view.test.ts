import { describe, expect, it } from 'vitest';

import { aPropertyDetail } from './test-fixtures';
import { formatMoney, formatPrice, formatShortPrice, formatSurface } from './format';
import { toListingCard, toListingDetail, toLocationOption, toMapPinView } from './view';

const detail = aPropertyDetail();

describe('format', () => {
  it('formats prices in whole units with Argentine grouping', () => {
    expect(formatMoney({ amountCents: 9_800_000n, currency: 'USD' })).toBe('USD 98.000');
    expect(formatMoney({ amountCents: 42_000_000n, currency: 'ARS' })).toBe('$ 420.000');
    expect(formatPrice(null)).toBe('Consultar precio');
    expect(formatSurface(48.5)).toBe('48,5 m²');
  });
});

describe('toListingCard', () => {
  it('hides expenses loaded as zero', () => {
    expect(
      toListingCard(aPropertyDetail({ expenses: { amountCents: 0n, currency: 'ARS' } }))
        .expensesLabel,
    ).toBeNull();
  });

  it('shows the price, the location and the main facts', () => {
    expect(toListingCard(detail)).toMatchObject({
      href: '/propiedades/departamento-3-ambientes-mataderos-dep0001',
      operationLabel: 'Venta',
      priceLabel: 'USD 98.000',
      expensesLabel: '+ $ 95.000 expensas',
      location: 'Mataderos, CABA',
      cover: { src: '/fotos/m1/abc', alt: 'Departamento 3 ambientes con balcón, Mataderos, CABA' },
      facts: [
        { kind: 'surface', label: '72 m²' },
        { kind: 'rooms', label: '3 amb.' },
        { kind: 'bedrooms', label: '2 dorm.' },
        { kind: 'bathrooms', label: '1 baño' },
      ],
    });
  });
});

describe('toListingDetail', () => {
  it('lists the known attributes, the other operations and the features by kind', () => {
    const view = toListingDetail(detail);
    expect(view.otherOperations).toEqual([{ label: 'Alquiler', value: 'Consultar precio' }]);
    expect(view.attributes).toContainEqual({ label: 'Estado', value: 'Muy bueno' });
    expect(view.attributes).toContainEqual({ label: 'Antigüedad', value: 'A estrenar' });
    expect(view.attributes).toContainEqual({ label: 'Apto crédito', value: 'Sí' });
    // Un valor que la web no conoce no se muestra.
    expect(view.attributes.map((a) => a.label)).not.toContain('Orientación');
    expect(view.featureGroups).toEqual([
      { label: 'Amenities', names: ['Pileta'] },
      { label: 'Servicios', names: ['Gas natural'] },
    ]);
    expect(view.photos.map((p) => p.alt)).toEqual([
      'Living',
      'Departamento 3 ambientes con balcón, Mataderos, CABA, foto 2',
    ]);
    expect(view.updatedAt).toBe('2026-10-01T12:00:00.000Z');
    expect(view.offer).toEqual({ amount: 98_000, currency: 'USD' });
    expect(() => JSON.stringify(view)).not.toThrow();
  });
});

describe('map and location views', () => {
  it('shortens the pin price and falls back to "Consultar"', () => {
    expect(formatShortPrice({ amountCents: 15_000_000n, currency: 'USD' })).toBe('USD 150 mil');
    expect(formatShortPrice({ amountCents: 120_000_000n, currency: 'ARS' })).toBe('$ 1,2 M');
    expect(formatShortPrice(null)).toBe('Consultar');
  });

  it('maps a pin with its card data', () => {
    const pin = toMapPinView({
      id: detail.id,
      slug: 'depto-palermo',
      title: 'Depto en Palermo',
      propertyType: 'apartment',
      operation: 'sale',
      price: { amountCents: 15_000_000n, currency: 'USD' },
      coordinates: { latitude: -34.58, longitude: -58.42, exact: false },
      cover: null,
      rooms: 3,
      surfaceTotalM2: 80,
      surfaceCoveredM2: 72,
      neighborhood: 'Palermo',
      city: 'CABA',
    });

    expect(pin).toMatchObject({
      href: '/propiedades/depto-palermo',
      operationLabel: 'Venta',
      shortPrice: 'USD 150 mil',
      priceLabel: 'USD 150.000',
      location: 'Palermo, CABA',
      exact: false,
      facts: '72 m² · 3 amb.',
    });
  });

  it('describes a location by its kind and context', () => {
    expect(
      toLocationOption({
        id: 'x',
        kind: 'subneighborhood',
        name: 'Palermo Soho',
        context: 'Palermo, CABA',
        listingCount: 3,
      }).description,
    ).toBe('Barrio · Palermo, CABA');
    expect(
      toLocationOption({ id: 'y', kind: 'province', name: 'CABA', context: '', listingCount: 9 })
        .description,
    ).toBe('Provincia');
  });
});
