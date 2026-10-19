import { describe, expect, it } from 'vitest';

import { aDevelopmentDetail } from '../properties/test-fixtures';
import { formatDeliveryDate, toDevelopmentCard, toDevelopmentDetail } from './view';

describe('formatDeliveryDate', () => {
  it('shows the month and the year, without time zones', () => {
    expect(formatDeliveryDate('2027-12-01')).toBe('diciembre de 2027');
    expect(formatDeliveryDate('2027-01-31')).toBe('enero de 2027');
  });

  it('ignores a malformed date', () => {
    expect(formatDeliveryDate('2027-13-01')).toBeNull();
    expect(formatDeliveryDate('diciembre')).toBeNull();
  });
});

describe('toDevelopmentCard', () => {
  it('formats the card: labels, delivery, price from, units and place', () => {
    expect(toDevelopmentCard(aDevelopmentDetail())).toMatchObject({
      href: '/emprendimientos/torre-gurruchaga-emp0001',
      typeLabel: 'Edificio',
      constructionLabel: 'En construcción',
      deliveryLabel: 'Entrega: diciembre de 2027',
      priceFromLabel: 'Desde USD 95.000',
      unitsLabel: '4 unidades disponibles',
      location: 'Palermo, CABA',
      cover: { src: '/fotos/m1/abc', alt: 'Torre Gurruchaga, Palermo, CABA' },
    });
  });

  it('asks to consult when there are no listed units or visible prices', () => {
    const card = toDevelopmentCard(
      aDevelopmentDetail({
        availableUnitCount: 0,
        priceFrom: null,
        deliveryDate: null,
        developmentType: null,
        constructionStatus: null,
      }),
    );
    expect(card).toMatchObject({
      unitsLabel: 'Consultá por unidades',
      priceFromLabel: null,
      deliveryLabel: null,
      typeLabel: null,
      constructionLabel: null,
    });
  });

  it('counts a single unit in singular', () => {
    expect(toDevelopmentCard(aDevelopmentDetail({ availableUnitCount: 1 })).unitsLabel).toBe(
      '1 unidad disponible',
    );
  });
});

describe('toDevelopmentDetail', () => {
  it('lists only the attributes that apply and groups the features', () => {
    const detail = toDevelopmentDetail(aDevelopmentDetail());
    expect(detail.attributes).toEqual([
      { label: 'Tipo', value: 'Edificio' },
      { label: 'Estado de obra', value: 'En construcción' },
      { label: 'Entrega estimada', value: 'diciembre de 2027' },
      { label: 'Financiación', value: 'Sí' },
    ]);
    expect(detail.featureGroups).toEqual([
      { label: 'Amenities', names: ['Pileta'] },
      { label: 'Servicios', names: ['Gas natural'] },
    ]);
    expect(detail.lowPrice).toEqual({ amount: 95_000, currency: 'USD' });
    expect(detail.photos[0]?.alt).toBe('Torre Gurruchaga, Palermo, CABA, foto 1');
    expect(detail.updatedAt).toBe('2026-10-01T12:00:00.000Z');
  });
});
