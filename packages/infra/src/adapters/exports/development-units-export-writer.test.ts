import { describe, expect, it } from 'vitest';

import {
  UNIT_IMPORT_FIELD_LABELS,
  UNIT_IMPORT_FIELD_VALUES,
  type PanelPropertyRow,
} from '@norde/core/properties';

import { XlsxSpreadsheetReader } from '../imports/xlsx-spreadsheet-reader';

import { XlsxDevelopmentUnitsExportWriter } from './development-units-export-writer';

function row(overrides: Partial<PanelPropertyRow> = {}): PanelPropertyRow {
  return {
    id: '00000000-0000-7000-8000-0000000000c1',
    code: 'DEP0001',
    propertyType: 'apartment',
    status: 'available',
    portalTitle: 'Departamento en venta en Palermo',
    publishAddress: 'Gurruchaga al 1800',
    floor: '4',
    unit: 'A',
    neighborhood: 'Palermo',
    city: 'CABA',
    province: 'CABA',
    operations: [{ operation: 'sale', currency: 'USD', priceCents: 15_000_000n }],
    attributes: {
      rooms: 3,
      bedrooms: 2,
      bathrooms: 1,
      parkingSpaces: undefined,
      ageYears: undefined,
      surfaceTotalM2: 80,
      surfaceCoveredM2: 72.5,
    },
    coverImageUrl: undefined,
    coordinates: undefined,
    producer: undefined,
    createdAt: new Date('2026-09-01T12:00:00Z'),
    updatedAt: new Date('2026-09-30T12:00:00Z'),
    deletedAt: undefined,
    deletedBy: undefined,
    ...overrides,
  };
}

async function* batches(...lists: PanelPropertyRow[][]) {
  for (const list of lists) {
    await Promise.resolve();
    yield list;
  }
}

async function bytesOf(body: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) chunks.push(chunk);
  return new Uint8Array(Buffer.concat(chunks));
}

describe('XlsxDevelopmentUnitsExportWriter', () => {
  it('names the file with the development code and the day in Buenos Aires', () => {
    const file = new XlsxDevelopmentUnitsExportWriter().write(batches(), {
      developmentCode: 'EMP0001',
      generatedAt: new Date('2026-10-04T01:00:00Z'),
    });
    expect(file.filename).toBe('unidades-emp0001-2026-10-03.xlsx');
  });

  it('writes the headers the import recognizes and one row per unit, readable back', async () => {
    const file = new XlsxDevelopmentUnitsExportWriter().write(
      batches(
        [row()],
        [
          row({
            code: 'DEP0002',
            floor: undefined,
            unit: 'Lote 3',
            propertyType: 'land',
            status: 'sold',
            operations: [
              { operation: 'sale', currency: 'USD', priceCents: null },
              { operation: 'rent', currency: 'ARS', priceCents: 90_000_050n },
            ],
          }),
        ],
      ),
      { developmentCode: 'EMP0001', generatedAt: new Date('2026-10-03T12:00:00Z') },
    );

    const sheet = await new XlsxSpreadsheetReader().open(await bytesOf(file.body));
    if (sheet.isErr()) throw new Error('The export is not a readable Excel');
    expect(sheet.value.headers).toEqual([
      'Código',
      ...UNIT_IMPORT_FIELD_VALUES.map((field) => UNIT_IMPORT_FIELD_LABELS[field]),
    ]);

    const rows = [];
    for await (const read of sheet.value.rows()) rows.push(read.cells);
    expect(rows).toEqual([
      [
        'DEP0001',
        '4',
        'A',
        'Departamento',
        '3',
        '80',
        '72.5',
        'USD',
        '150000',
        undefined,
        undefined,
        undefined,
        undefined,
        'Disponible',
      ],
      [
        'DEP0002',
        undefined,
        'Lote 3',
        'Terreno',
        '3',
        '80',
        '72.5',
        'USD',
        undefined,
        'ARS',
        '900000.50',
        undefined,
        undefined,
        'Vendida',
      ],
    ]);
  });
});
