import { Readable } from 'node:stream';

import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import type { PropertyExportRow } from '@norde/core/properties';

import { FilePropertyExportWriter } from './property-export-writer';

const GENERATED_AT = new Date('2026-10-01T15:00:00Z');

function row(overrides: Partial<PropertyExportRow> = {}): PropertyExportRow {
  return {
    id: '00000000-0000-7000-8000-0000000000c1',
    code: 'DEP0001',
    propertyType: 'apartment',
    status: 'available',
    portalTitle: 'Departamento en venta en Palermo; "luminoso"',
    publishAddress: 'Gurruchaga al 1800',
    floor: undefined,
    unit: undefined,
    developmentId: undefined,
    neighborhood: 'Palermo',
    city: 'CABA',
    province: 'CABA',
    operations: [
      { operation: 'sale', currency: 'USD', priceCents: 12_000_050n },
      { operation: 'rent', currency: 'ARS', priceCents: null },
    ],
    attributes: {
      rooms: 3,
      bedrooms: 2,
      bathrooms: 1,
      parkingSpaces: undefined,
      ageYears: 15,
      surfaceTotalM2: 70.5,
      surfaceCoveredM2: 65,
    },
    cover: undefined,
    coordinates: undefined,
    producer: { id: '00000000-0000-7000-8000-0000000000a1', name: 'Camila Ruiz' },
    createdAt: new Date('2026-09-01T12:00:00Z'),
    updatedAt: new Date('2026-09-30T02:00:00Z'),
    deletedAt: undefined,
    deletedBy: undefined,
    details: {
      address: 'Gurruchaga 1850 3 B',
      toilets: 1,
      surfaceSemiCoveredM2: 6.5,
      surfaceLandM2: undefined,
      frontM: undefined,
      depthM: undefined,
      expensesCents: 8_500_000n,
      maintenanceUser: undefined,
      branch: 'Centro',
      development: undefined,
      owner: { name: 'Ana Pérez', email: 'ana@example.com', mobile: '+5491166660001' },
    },
    ...overrides,
  };
}

async function* batches(...lists: PropertyExportRow[][]) {
  for (const list of lists) {
    await Promise.resolve();
    yield list;
  }
}

async function read(body: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/** Los valores de una fila del Excel, por encabezado. */
function byHeader(sheet: ExcelJS.Worksheet, rowNumber: number): Map<string, ExcelJS.CellValue> {
  const values = new Map<string, ExcelJS.CellValue>();
  sheet.getRow(1).eachCell((cell, column) => {
    values.set(
      typeof cell.value === 'string' ? cell.value : '',
      sheet.getRow(rowNumber).getCell(column).value,
    );
  });
  return values;
}

describe('FilePropertyExportWriter', () => {
  const writer = new FilePropertyExportWriter();

  it('writes a CSV that Excel opens in Spanish, with decimal commas and local dates', async () => {
    const file = writer.write('csv', batches([row()], [row({ code: 'DEP0002' })]), {
      generatedAt: GENERATED_AT,
      includeOwners: false,
    });
    const text = (await read(file.body)).toString('utf8');
    const lines = text.split(/\r\n/);

    expect(file).toMatchObject({
      filename: 'propiedades-2026-10-01.csv',
      contentType: 'text/csv; charset=utf-8',
    });
    expect(text.startsWith('\uFEFFCódigo;Tipo;Estado;Título;Dirección;')).toBe(true);
    expect(lines[0]).not.toContain('Propietario');
    expect(lines[1]).toContain(
      'DEP0001;Departamento;Disponible;"Departamento en venta en Palermo; ""luminoso""";Gurruchaga 1850 3 B;',
    );
    expect(lines[1]).toContain('USD;120000,50;ARS;Consultar;;;85000;3;2;1;1;;15;70,5;65;6,5;');
    // El 30/09 a las 02:00 UTC todavía es el 29/09 en Buenos Aires.
    expect(lines[1]).toContain('Camila Ruiz;;Centro;01/09/2026;29/09/2026');
    expect(lines[2]?.startsWith('DEP0002;')).toBe(true);
  });

  it('writes an Excel sheet with typed cells and the owner columns when allowed', async () => {
    const file = writer.write('xlsx', batches([row(), row({ code: 'DEP0002' })]), {
      generatedAt: GENERATED_AT,
      includeOwners: true,
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.read(Readable.from(file.body));
    const sheet = workbook.getWorksheet('Propiedades');
    if (sheet === undefined) throw new Error('Missing sheet');

    expect(sheet.rowCount).toBe(3);
    expect(sheet.getRow(3).getCell(1).value).toBe('DEP0002');
    const first = byHeader(sheet, 2);
    expect(first.get('Venta: precio')).toBe(120_000.5);
    expect(first.get('Alquiler: precio')).toBe('Consultar');
    expect(first.get('Expensas (ARS)')).toBe(85_000);
    expect(first.get('Sup. total (m²)')).toBe(70.5);
    expect(first.get('Alta')).toEqual(new Date('2026-09-01T00:00:00.000Z'));
    expect(first.get('Propietario')).toBe('Ana Pérez');
    expect(first.get('Email')).toBe('ana@example.com');
    expect(first.get('Celular')).toBe('+5491166660001');
  });
});
