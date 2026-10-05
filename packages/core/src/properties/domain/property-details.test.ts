import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared';
import { unwrap, unwrapErr } from '../../shared/testing';
import { Property, type NewProperty } from './property';
import {
  CONDITIONS,
  CUSTOM_ATTRIBUTE_KINDS,
  DISPOSITIONS,
  EMPTY_CHARACTERISTICS,
  EMPTY_DEAL_ATTRIBUTES,
  EMPTY_INTERNAL_INFO,
  ORIENTATIONS,
  validateCharacteristics,
  validateCustomAttributes,
  type CustomAttributeDefinition,
} from './property-details';

const NOW = new Date('2026-10-01T12:00:00Z');
const LATER = new Date('2026-10-02T12:00:00Z');
const ID = unwrap(parseId<'Property'>('00000000-0000-7000-8000-0000000000c1'));
const USER = '00000000-0000-7000-8000-0000000000a1';

const NEW: NewProperty = {
  id: ID,
  code: 'DEP0001',
  kind: 'apartment',
  operation: { operation: 'sale', currency: 'USD', priceCents: 12_000_000n },
  address: {
    street: 'Gurruchaga',
    streetNumber: '1834',
    floor: undefined,
    unit: undefined,
    neighborhood: 'Palermo',
    city: 'CABA',
    province: 'Buenos Aires',
  },
  publishAddress: undefined,
  portalTitle: undefined,
  coordinates: undefined,
  locationId: undefined,
  producerUserId: USER,
  branchId: undefined,
  now: NOW,
};

function aProperty(): Property {
  const property = unwrap(Property.create(NEW));
  property.pullEvents();
  return property;
}

function trashed(): Property {
  const property = aProperty();
  unwrap(property.delete(USER, NOW));
  return property;
}

describe('validateCharacteristics', () => {
  it('accepts covered plus semi-covered up to the total surface', () => {
    const value = {
      ...EMPTY_CHARACTERISTICS,
      surfaceTotalM2: 60,
      surfaceCoveredM2: 50.5,
      surfaceSemiCoveredM2: 9.5,
    };
    expect(unwrap(validateCharacteristics(value))).toEqual(value);
  });

  it('rejects a covered surface larger than the total', () => {
    const value = { ...EMPTY_CHARACTERISTICS, surfaceTotalM2: 40, surfaceCoveredM2: 40.01 };
    expect(unwrapErr(validateCharacteristics(value))).toEqual({ type: 'CoveredExceedsTotal' });
  });

  it('rejects negative values', () => {
    expect(unwrapErr(validateCharacteristics({ ...EMPTY_CHARACTERISTICS, rooms: -1 }))).toEqual({
      type: 'NegativeCharacteristic',
      field: 'rooms',
    });
  });
});

describe('validateCustomAttributes', () => {
  const definitions: CustomAttributeDefinition[] = [
    { id: 'a-text', kind: 'text', options: [], isActive: true },
    { id: 'a-number', kind: 'number', options: [], isActive: true },
    { id: 'a-select', kind: 'select', options: ['Norte', 'Sur'], isActive: true },
    { id: 'a-off', kind: 'boolean', options: [], isActive: false },
  ];

  it('keeps valid values and drops empty texts', () => {
    const result = validateCustomAttributes(
      [
        { attributeId: 'a-text', value: '  ' },
        { attributeId: 'a-number', value: 3 },
        { attributeId: 'a-select', value: 'Sur' },
      ],
      definitions,
    );
    expect(unwrap(result)).toEqual([
      { attributeId: 'a-number', value: 3 },
      { attributeId: 'a-select', value: 'Sur' },
    ]);
  });

  it('rejects a value of another type or outside the options', () => {
    expect(
      unwrapErr(validateCustomAttributes([{ attributeId: 'a-number', value: '3' }], definitions)),
    ).toEqual({ type: 'InvalidCustomAttributeValue', attributeId: 'a-number' });
    expect(
      unwrapErr(
        validateCustomAttributes([{ attributeId: 'a-select', value: 'Este' }], definitions),
      ),
    ).toEqual({ type: 'InvalidCustomAttributeValue', attributeId: 'a-select' });
  });

  it('rejects unknown or inactive attributes', () => {
    expect(
      unwrapErr(validateCustomAttributes([{ attributeId: 'a-off', value: true }], definitions)),
    ).toEqual({ type: 'CustomAttributeNotFound', attributeId: 'a-off' });
  });
});

describe('Property.setOperations', () => {
  it('adds an operation and records its price', () => {
    const property = aProperty();
    const changed = property.setOperations(
      [
        { operation: 'sale', currency: 'USD', priceCents: 12_000_000n },
        {
          operation: 'rent',
          currency: 'ARS',
          priceCents: 80_000_000n,
          priceOnRequest: true,
          commissionPct: 4.15,
        },
      ],
      LATER,
    );
    expect(unwrap(changed)).toBe(true);
    expect(property.toSnapshot().operations).toHaveLength(2);
    expect(property.priceChanges).toEqual([
      {
        operation: 'rent',
        currency: 'ARS',
        oldPriceCents: undefined,
        newPriceCents: 80_000_000n,
        changedAt: LATER,
      },
    ]);
    expect(property.pullEvents().map((event) => event.type)).toEqual([
      'properties.property_price_changed',
      'properties.property_changed',
    ]);
  });

  it('does not emit a price change when only the commission changes', () => {
    const property = aProperty();
    unwrap(
      property.setOperations(
        [{ operation: 'sale', currency: 'USD', priceCents: 12_000_000n, commissionPct: 3 }],
        LATER,
      ),
    );
    expect(property.priceChanges).toEqual([]);
    expect(property.pullEvents().map((event) => event.type)).toEqual([
      'properties.property_changed',
    ]);
  });

  it('reports no change when the operations are the same', () => {
    const property = aProperty();
    expect(
      unwrap(
        property.setOperations(
          [{ operation: 'sale', currency: 'USD', priceCents: 12_000_000n }],
          LATER,
        ),
      ),
    ).toBe(false);
  });

  it('requires at least one operation and no duplicates', () => {
    const property = aProperty();
    expect(unwrapErr(property.setOperations([], LATER))).toEqual({
      type: 'InvalidOperations',
      reason: 'empty',
    });
    const sale = { operation: 'sale', currency: 'USD', priceCents: undefined } as const;
    expect(unwrapErr(property.setOperations([sale, sale], LATER))).toEqual({
      type: 'InvalidOperations',
      reason: 'duplicated',
    });
  });

  it('rejects commissions out of range or with more than two decimals', () => {
    const property = aProperty();
    for (const commissionPct of [-1, 100.01, 3.333]) {
      expect(
        unwrapErr(
          property.setOperations(
            [{ operation: 'sale', currency: 'USD', priceCents: undefined, commissionPct }],
            LATER,
          ),
        ),
      ).toEqual({ type: 'InvalidCommission' });
    }
  });

  it('rejects negative prices', () => {
    expect(
      unwrapErr(
        aProperty().setOperations([{ operation: 'sale', currency: 'USD', priceCents: -1n }], LATER),
      ),
    ).toEqual({ type: 'NegativePrice' });
  });
});

describe('Property.changeCode', () => {
  it('stores the code in uppercase and keeps the slug', () => {
    const property = aProperty();
    const slug = property.toSnapshot().slug;
    expect(unwrap(property.changeCode(' dep-0099 ', LATER))).toBe(true);
    expect(property.code).toBe('DEP-0099');
    expect(property.toSnapshot().slug).toBe(slug);
  });

  it('rejects codes with spaces or symbols', () => {
    expect(unwrapErr(aProperty().changeCode('DEP 01', LATER))).toEqual({
      type: 'InvalidReferenceCode',
    });
  });

  it('reports no change for the same code', () => {
    expect(unwrap(aProperty().changeCode('dep0001', LATER))).toBe(false);
  });
});

describe('Property.updateLocation', () => {
  it('suggests the publish address when it is left empty', () => {
    const property = aProperty();
    const changed = property.updateLocation(
      {
        address: { ...NEW.address, street: 'Honduras', streetNumber: '5120' },
        publishAddress: ' ',
        locationId: undefined,
        coordinates: undefined,
      },
      LATER,
    );
    expect(unwrap(changed)).toBe(true);
    expect(property.toSnapshot().publishAddress).toBe('Honduras al 5100');
  });

  it('reports no change for the same location', () => {
    const snapshot = aProperty().toSnapshot();
    const changed = aProperty().updateLocation(
      {
        address: snapshot.address,
        publishAddress: snapshot.publishAddress,
        locationId: undefined,
        coordinates: undefined,
      },
      LATER,
    );
    expect(unwrap(changed)).toBe(false);
  });
});

describe('Property.updateDescription', () => {
  it('trims the description and suggests the title when empty', () => {
    const property = aProperty();
    expect(
      unwrap(property.updateDescription({ portalTitle: '', description: '  Luminoso.  ' }, LATER)),
    ).toBe(true);
    expect(property.toSnapshot()).toMatchObject({
      description: 'Luminoso.',
      portalTitle: 'Departamento en venta en Palermo',
    });
  });
});

describe('Property section edits', () => {
  it('validates the characteristics', () => {
    const property = aProperty();
    expect(
      unwrapErr(
        property.updateCharacteristics(
          { ...EMPTY_CHARACTERISTICS, surfaceTotalM2: 10, surfaceCoveredM2: 20 },
          LATER,
        ),
      ),
    ).toEqual({ type: 'CoveredExceedsTotal' });
    expect(
      unwrap(property.updateCharacteristics({ ...EMPTY_CHARACTERISTICS, rooms: 3 }, LATER)),
    ).toBe(true);
    expect(
      unwrap(property.updateCharacteristics({ ...EMPTY_CHARACTERISTICS, rooms: 3 }, LATER)),
    ).toBe(false);
  });

  it('rejects negative expenses', () => {
    expect(
      unwrapErr(aProperty().updateDeal({ ...EMPTY_DEAL_ATTRIBUTES, expensesCents: -1n }, LATER)),
    ).toEqual({ type: 'NegativePrice' });
  });

  it('ignores the order of features and appraisers', () => {
    const property = aProperty();
    expect(unwrap(property.updateFeatures(['f2', 'f1', 'f1'], LATER))).toBe(true);
    expect(unwrap(property.updateFeatures(['f1', 'f2'], LATER))).toBe(false);
    expect(
      unwrap(
        property.updateInternalInfo(
          { ...EMPTY_INTERNAL_INFO, appraiserUserIds: ['u2', 'u1'], keysLocation: ' Oficina ' },
          LATER,
        ),
      ),
    ).toBe(true);
    expect(property.toSnapshot().internal).toMatchObject({
      appraiserUserIds: ['u1', 'u2'],
      keysLocation: 'Oficina',
    });
    expect(
      unwrap(
        property.updateInternalInfo(
          { ...EMPTY_INTERNAL_INFO, appraiserUserIds: ['u1', 'u2'], keysLocation: 'Oficina' },
          LATER,
        ),
      ),
    ).toBe(false);
  });

  it('publishes on the web in any status, with or without price', () => {
    const property = aProperty();
    expect(
      unwrap(property.updatePublication({ publishedOnWeb: true, showPriceOnWeb: false }, LATER)),
    ).toBe(true);
    expect(property.toSnapshot().publication).toMatchObject({
      publishedOnWeb: true,
      showPriceOnWeb: false,
      featured: false,
    });
    expect(unwrap(property.updatePublication({ publishedOnWeb: true }, LATER))).toBe(false);
  });

  it('does not edit a property in the trash', () => {
    const property = trashed();
    const inTrash = { type: 'PropertyInTrash' };
    expect(unwrapErr(property.updatePublication({ featured: true }, LATER))).toEqual(inTrash);
    expect(unwrapErr(property.updateFeatures([], LATER))).toEqual(inTrash);
    expect(unwrapErr(property.changeCode('X1', LATER))).toEqual(inTrash);
    expect(unwrapErr(property.setOperations([], LATER))).toEqual(inTrash);
  });
});

describe('catalog values', () => {
  it('match the values the contracts offer', async () => {
    const contracts = await import('../contracts');
    expect([...ORIENTATIONS]).toEqual([...contracts.ORIENTATION_VALUES]);
    expect([...CONDITIONS]).toEqual([...contracts.CONDITION_VALUES]);
    expect([...DISPOSITIONS]).toEqual([...contracts.DISPOSITION_VALUES]);
    expect([...CUSTOM_ATTRIBUTE_KINDS]).toEqual([...contracts.CUSTOM_ATTRIBUTE_KIND_VALUES]);
  });
});
