import { listingSource } from '@norde/core/portals/testing';
import { describe, expect, it } from 'vitest';

import {
  categoryOf,
  listingAttributes,
  listingPrice,
  listingProblems,
  sellerContact,
  splitPhone,
} from './mercadolibre-listing';

const SALE = { source: listingSource(), operation: 'sale', listingType: 'simple' } as const;

describe('categoryOf', () => {
  it('uses the individual-property leaf, never developments', () => {
    expect(categoryOf('apartment', 'sale')).toBe('MLA401686');
    expect(categoryOf('house', 'rent')).toBe('MLA1467');
    expect(categoryOf('garage', 'sale')).toBe('MLA50543');
  });

  it('has no temporary rent for land, offices and the like', () => {
    expect(categoryOf('land', 'temporary_rent')).toBeUndefined();
    expect(categoryOf('office', 'temporary_rent')).toBeUndefined();
  });
});

describe('listingProblems', () => {
  it('accepts a complete apartment', () => {
    expect(listingProblems(SALE)).toEqual([]);
  });

  it('lists the required data that is missing', () => {
    const source = listingSource({
      characteristics: {
        ...listingSource().characteristics,
        surfaceCoveredM2: undefined,
        rooms: undefined,
      },
    });
    expect(listingProblems({ ...SALE, source })).toEqual([
      'Falta la superficie cubierta.',
      'Falta los ambientes.',
    ]);
  });

  it('does not ask for parking spaces: empty is sent as 0', () => {
    const source = listingSource();
    expect(source.characteristics.parkingSpaces).toBeUndefined();
    expect(listingProblems({ ...SALE, source })).toEqual([]);
  });

  it('requires a photo, a WhatsApp and a location', () => {
    const source = listingSource({
      photos: [],
      contact: { ...listingSource().contact, whatsapp: undefined },
      location: { province: undefined, city: undefined, neighborhood: undefined },
    });
    expect(listingProblems({ ...SALE, source })).toHaveLength(3);
  });

  it('does not publish temporary rents yet', () => {
    expect(listingProblems({ ...SALE, operation: 'temporary_rent' })[0]).toContain('temporario');
  });

  it('only asks a garage for its surface', () => {
    const source = listingSource({
      kind: 'garage',
      characteristics: {
        ...listingSource().characteristics,
        surfaceCoveredM2: undefined,
        rooms: undefined,
        bedrooms: undefined,
        bathrooms: undefined,
      },
    });
    expect(listingProblems({ ...SALE, source })).toEqual([]);
  });

  it('takes the land surface for a lot', () => {
    const source = listingSource({
      kind: 'land',
      characteristics: {
        ...listingSource().characteristics,
        surfaceTotalM2: undefined,
        surfaceLandM2: 300,
      },
    });
    expect(listingProblems({ ...SALE, source })).toEqual([]);
  });
});

describe('listingAttributes', () => {
  it('maps an apartment for sale', () => {
    expect(listingAttributes(SALE)).toEqual([
      { id: 'TOTAL_AREA', value_name: '70 m²' },
      { id: 'COVERED_AREA', value_name: '65 m²' },
      { id: 'ROOMS', value_name: '3' },
      { id: 'BEDROOMS', value_name: '2' },
      { id: 'FULL_BATHROOMS', value_name: '1' },
      { id: 'PARKING_LOTS', value_name: '0' },
      { id: 'PROPERTY_AGE', value_name: '10 años' },
      { id: 'MAINTENANCE_FEE', value_name: '80000 ARS' },
      { id: 'FACING', value_id: '242327' },
      { id: 'FURNISHED', value_name: 'No' },
      { id: 'PROFESSIONAL_USE_ALLOWED', value_name: 'No' },
      { id: 'SUITABLE_FOR_MORTGAGE_LOAN', value_name: 'Sí' },
      { id: 'PROPERTY_CODE', value_name: 'DEP0001' },
    ]);
  });

  it('sends "Otro" as the access of a lot', () => {
    const source = listingSource({
      kind: 'land',
      characteristics: {
        ...listingSource().characteristics,
        surfaceTotalM2: undefined,
        surfaceLandM2: 300,
      },
    });
    expect(listingAttributes({ ...SALE, source })).toContainEqual({
      id: 'LAND_ACCESS',
      value_id: '245047',
    });
  });

  it('leaves out diagonal orientations, which MercadoLibre does not have', () => {
    const source = listingSource({
      characteristics: { ...listingSource().characteristics, orientation: 'northeast' },
    });
    expect(listingAttributes({ ...SALE, source }).map((a) => a.id)).not.toContain('FACING');
  });
});

describe('listingPrice', () => {
  it('sends whole units of the currency of the operation', () => {
    expect(listingPrice(SALE)).toEqual({ price: 120_000, currency: 'USD' });
  });

  it('has no price for an operation without one', () => {
    expect(listingPrice({ ...SALE, operation: 'rent' })).toBeUndefined();
  });
});

describe('seller contact', () => {
  it('splits Argentine numbers into country code and number', () => {
    expect(splitPhone('+5491166000000')).toEqual({ countryCode: '54', number: '91166000000' });
    expect(splitPhone('+14155550100')).toBeUndefined();
  });

  it('sends the WhatsApp as phone2, as MercadoLibre requires', () => {
    expect(sellerContact(listingSource())).toEqual({
      contact: 'Casa central',
      email: 'ventas@norde.test',
      country_code: '54',
      phone: '1148000000',
      country_code2: '54',
      phone2: '91166000000',
    });
  });
});
