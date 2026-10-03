import { describe, expect, it } from 'vitest';

import { unwrap, unwrapErr } from '../../shared/testing';
import type { UnitImportMapping } from '../domain/development-unit-import';

import { parseHundredths, readUnitImportRow } from './unit-import-row';

/** Las columnas de la exportación, sin el código. */
const MAPPING: UnitImportMapping = {
  floor: 0,
  unit: 1,
  propertyType: 2,
  rooms: 3,
  surfaceTotalM2: 4,
  surfaceCoveredM2: 5,
  saleCurrency: 6,
  salePrice: 7,
  rentCurrency: 8,
  rentPrice: 9,
  status: 10,
};

function row(values: Partial<Record<keyof typeof MAPPING, string>>): (string | undefined)[] {
  const cells: (string | undefined)[] = [];
  for (const [field, column] of Object.entries(MAPPING)) {
    cells[column] = values[field as keyof typeof MAPPING];
  }
  return cells;
}

describe('parseHundredths', () => {
  it.each([
    ['120000', 12_000_000n],
    ['120.000', 12_000_000n],
    ['1.250.000', 125_000_000n],
    ['120.000,50', 12_000_050n],
    ['120000,5', 12_000_050n],
    ['120,000.50', 12_000_050n],
    ['45.5', 4550n],
    // Un punto con tres cifras es de miles, como en una planilla argentina.
    ['45.125', 4_512_500n],
    ['45,25', 4525n],
  ])('reads %s', (raw, expected) => {
    expect(parseHundredths(raw)).toBe(expected);
  });

  it.each(['', 'abc', '-5', '12.3.4', '1,2,3', '45.1234'])('rejects %s', (raw) => {
    expect(parseHundredths(raw)).toBeUndefined();
  });
});

describe('readUnitImportRow', () => {
  it('reads every column of the export', () => {
    const read = unwrap(
      readUnitImportRow(
        row({
          floor: '4',
          unit: 'A',
          propertyType: 'Departamento',
          rooms: '3',
          surfaceTotalM2: '80',
          surfaceCoveredM2: '72,5',
          saleCurrency: 'USD',
          salePrice: '150000',
          status: 'Disponible',
        }),
        MAPPING,
      ),
    );

    expect(read).toEqual({
      floor: '4',
      unit: 'A',
      propertyType: 'apartment',
      rooms: 3,
      surfaceTotalM2: 80,
      surfaceCoveredM2: 72.5,
      operations: [{ operation: 'sale', currency: 'USD', price: { cents: 15_000_000n } }],
      status: 'available',
    });
  });

  it('leaves out what the row does not bring, so an empty cell changes nothing', () => {
    const read = unwrap(readUnitImportRow(row({ unit: 'B', rentCurrency: 'ARS' }), MAPPING));

    expect(read).toEqual({
      floor: undefined,
      unit: 'B',
      propertyType: undefined,
      rooms: undefined,
      surfaceTotalM2: undefined,
      surfaceCoveredM2: undefined,
      operations: [{ operation: 'rent', currency: 'ARS', price: undefined }],
      status: undefined,
    });
  });

  it('takes the currency written with the price and reads "Consultar" as no price', () => {
    expect(
      unwrap(readUnitImportRow(row({ unit: 'A', salePrice: 'U$S 98.500' }), MAPPING)),
    ).toMatchObject({
      operations: [{ operation: 'sale', currency: 'USD', price: { cents: 9_850_000n } }],
    });
    expect(
      unwrap(
        readUnitImportRow(row({ unit: 'A', saleCurrency: 'USD', salePrice: 'consultar' }), MAPPING),
      ),
    ).toMatchObject({ operations: [{ currency: 'USD', price: { cents: undefined } }] });
  });

  it('accepts the type and status by their key or label, without accents or case', () => {
    expect(
      unwrap(
        readUnitImportRow(row({ unit: 'A', propertyType: 'galpon', status: 'VENDIDA' }), MAPPING),
      ),
    ).toMatchObject({ propertyType: 'warehouse', status: 'sold' });
    expect(
      unwrap(readUnitImportRow(row({ unit: 'A', propertyType: 'ph', status: 'paused' }), MAPPING)),
    ).toMatchObject({ propertyType: 'ph', status: 'paused' });
  });

  it('needs a unit', () => {
    expect(unwrapErr(readUnitImportRow(row({ floor: '4' }), MAPPING))).toEqual({
      code: 'missing_unit',
      field: undefined,
    });
  });

  it.each([
    [{ unit: 'Unidad muy larga' }, 'unit'],
    [{ unit: 'A', floor: 'Piso dieciocho' }, 'floor'],
    [{ unit: 'A', propertyType: 'Castillo' }, 'propertyType'],
    [{ unit: 'A', rooms: '2,5' }, 'rooms'],
    [{ unit: 'A', surfaceTotalM2: 'ochenta' }, 'surfaceTotalM2'],
    [{ unit: 'A', saleCurrency: 'EUR' }, 'saleCurrency'],
    [{ unit: 'A', salePrice: '-100' }, 'salePrice'],
    [{ unit: 'A', status: 'Vendidísima' }, 'status'],
  ] as const)('flags an invalid value in %o', (values, field) => {
    expect(unwrapErr(readUnitImportRow(row(values), MAPPING))).toEqual({
      code: 'invalid_value',
      field,
    });
  });
});
