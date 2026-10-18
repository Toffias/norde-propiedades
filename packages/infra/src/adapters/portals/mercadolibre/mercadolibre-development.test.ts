import type { DevelopmentListingContent, ListingSource } from '@norde/core/portals';
import { developmentListingSource, listingSource } from '@norde/core/portals/testing';
import { describe, expect, it } from 'vitest';

import {
  developmentCategory,
  developmentItem,
  developmentProblems,
  developmentUnits,
  modelName,
  unitName,
} from './mercadolibre-development';

const DEVELOPMENT_ID = '01920000-0000-7000-8000-0000000000d1';
const UNIT_A = '01920000-0000-7000-8000-0000000000e1';
const UNIT_B = '01920000-0000-7000-8000-0000000000e2';

function unit(overrides: Partial<ListingSource> = {}): ListingSource {
  return listingSource({
    propertyId: UNIT_A,
    code: 'AP0001',
    developmentId: DEVELOPMENT_ID,
    unitDesignation: { floor: '3', unit: 'B' },
    operations: [
      { operation: 'sale', currency: 'USD', priceCents: 12_000_000n, priceOnRequest: false },
    ],
    ...overrides,
  });
}

function content(
  overrides: Partial<DevelopmentListingContent['source']> = {},
): DevelopmentListingContent {
  return {
    kind: 'development',
    listingId: '01920000-0000-7000-8000-00000000a002',
    source: developmentListingSource({
      developmentId: DEVELOPMENT_ID,
      units: [unit()],
      ...overrides,
    }),
    listingType: 'simple',
    plan: undefined,
  };
}

const garage = unit({
  propertyId: UNIT_B,
  code: 'CO0001',
  kind: 'garage',
  unitDesignation: { floor: 'SS', unit: '12' },
});

describe('developmentUnits', () => {
  it('keeps the units for sale of the most common kind ML publishes as a development', () => {
    const second = unit({ propertyId: UNIT_B, code: 'AP0002' });
    const house = unit({ propertyId: '01920000-0000-7000-8000-0000000000e3', kind: 'house' });
    const forRent = unit({
      propertyId: '01920000-0000-7000-8000-0000000000e4',
      operations: [
        { operation: 'rent', currency: 'ARS', priceCents: 50_000_000n, priceOnRequest: false },
      ],
    });
    const source = content({ units: [house, unit(), second, garage, forRent] }).source;

    expect(developmentUnits(source).map((u) => u.code)).toEqual(['AP0001', 'AP0002']);
    expect(developmentCategory(source)).toBe('MLA401806');
  });

  it('breaks a tie in the order apartments, houses, offices, lots', () => {
    const house = unit({ propertyId: UNIT_B, kind: 'house' });
    expect(developmentCategory(content({ units: [house, unit()] }).source)).toBe('MLA401806');
    const lot = unit({ propertyId: UNIT_B, kind: 'land' });
    expect(developmentCategory(content({ units: [lot] }).source)).toBe('MLA401803');
  });
});

describe('developmentProblems', () => {
  it('accepts a complete development', () => {
    expect(developmentProblems(content())).toEqual([]);
  });

  it('does not complain about an empty development: it is paused', () => {
    expect(developmentProblems(content({ units: [] }))).toEqual([]);
  });

  it('says when no unit is of a kind ML publishes as a development', () => {
    expect(developmentProblems(content({ units: [garage] }))[0]).toContain(
      'departamentos, casas, oficinas o lotes',
    );
  });

  it('blocks units priced in different currencies', () => {
    const inPesos = unit({
      propertyId: UNIT_B,
      code: 'AP0002',
      operations: [
        { operation: 'sale', currency: 'ARS', priceCents: 9_000_000_000n, priceOnRequest: false },
      ],
    });
    expect(developmentProblems(content({ units: [unit(), inPesos] }))).toContain(
      'Las unidades tienen precios en monedas distintas: MercadoLibre pide una sola moneda por emprendimiento.',
    );
  });

  it('names the unit that misses what ML requires', () => {
    const bare = unit({
      characteristics: { ...unit().characteristics, rooms: undefined, surfaceCoveredM2: undefined },
    });
    expect(developmentProblems(content({ units: [bare] }))).toEqual([
      'A la unidad AP0001 le falta la superficie cubierta, los ambientes.',
    ]);
  });

  it('needs the stage of the works, a photo for every unit and the branch WhatsApp', () => {
    const noPhotos = unit({ photos: [] });
    const problems = developmentProblems(
      content({
        units: [noPhotos],
        photos: [],
        stage: undefined,
        contact: { ...developmentListingSource().contact, whatsapp: undefined },
      }),
    );
    expect(problems).toHaveLength(3);
    expect(problems.join(' ')).toContain('foto en cada unidad');
    expect(problems.join(' ')).toContain('etapa de la obra');
    expect(problems.join(' ')).toContain('WhatsApp');
  });
});

describe('unitName and modelName', () => {
  it('names the unit by its floor and unit, or by its code', () => {
    expect(unitName(unit())).toBe('Piso 3 · B');
    expect(unitName(unit({ unitDesignation: { floor: 'PB', unit: '2' } }))).toBe('PB · 2');
    expect(unitName(unit({ unitDesignation: undefined }))).toBe('AP0001');
  });

  it('describes the typology', () => {
    expect(modelName(unit())).toBe('3 ambientes');
    expect(modelName(unit({ characteristics: { ...unit().characteristics, rooms: 1 } }))).toBe(
      'Monoambiente',
    );
    expect(modelName(unit({ kind: 'house' }))).toBe('Casa de 2 dormitorios');
    expect(modelName(unit({ kind: 'land' }))).toBe('Lote de 70 m²');
  });
});

describe('developmentItem', () => {
  it('sends the units as variations with their price, attributes and pictures', () => {
    const item = developmentItem(content());

    expect(item).toMatchObject({
      title: 'Torre Mataderos',
      price: 120_000,
      currency_id: 'USD',
      pictures: [{ source: 'https://signed/r1' }, { source: 'https://signed/1' }],
      attributes: [
        { id: 'DEVELOPMENT_NAME', value_name: 'Torre Mataderos' },
        { id: 'POSSESSION_STATUS', value_id: '27191631' },
      ],
    });
    expect(item.variations).toEqual([
      {
        price: 120_000,
        available_quantity: 1,
        seller_custom_field: UNIT_A,
        attribute_combinations: [
          { id: 'UNIT_NAME', value_name: 'Piso 3 · B' },
          { id: 'MODEL_NAME', value_name: '3 ambientes' },
          { id: 'TOTAL_AREA', value_name: '70 m²' },
          { id: 'COVERED_AREA', value_name: '65 m²' },
          { id: 'ROOMS', value_name: '3' },
          { id: 'BEDROOMS', value_name: '2' },
          { id: 'FULL_BATHROOMS', value_name: '1' },
          { id: 'PARKING_LOTS', value_name: '0' },
        ],
        picture_ids: ['https://signed/1'],
      },
    ]);
  });

  it('keeps the ID of the variations already published, and uses the cover for a unit without photos', () => {
    const noPhotos = unit({ propertyId: UNIT_B, code: 'AP0002', photos: [] });
    const item = developmentItem(content({ units: [unit(), noPhotos] }), [
      { id: 52173477243, unitId: UNIT_B },
    ]);

    expect(item.variations[0]).not.toHaveProperty('id');
    expect(item.variations[1]).toMatchObject({
      id: 52173477243,
      picture_ids: ['https://signed/r1'],
    });
  });

  it('adds the code to units with the same name, so ML takes them apart', () => {
    const twin = unit({ propertyId: UNIT_B, code: 'AP0002' });
    const names = developmentItem(content({ units: [unit(), twin] })).variations.map(
      (v) => v.attribute_combinations[0]?.value_name,
    );
    expect(names).toEqual(['Piso 3 · B (AP0001)', 'Piso 3 · B (AP0002)']);
  });
});
