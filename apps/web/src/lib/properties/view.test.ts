import { describe, expect, it } from 'vitest';

import { aPropertyDetail } from './test-fixtures';
import { formatMoney, formatPrice, formatSurface } from './format';
import { toListingCard, toListingDetail } from './view';

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
