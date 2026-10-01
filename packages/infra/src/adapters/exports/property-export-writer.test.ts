import { Readable } from 'node:stream';

import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import type { PanelPropertyRow } from '@norde/core/properties';

import { FilePropertyExportWriter } from './property-export-writer';

const GENERATED_AT = new Date('2026-10-01T15:00:00Z');

function row(overrides: Partial<PanelPropertyRow> = {}): PanelPropertyRow {
  return {
    id: '00000000-0000-7000-8000-0000000000c1',
    code: 'DEP0001',
    propertyType: 'apartment',
    status: 'available',
    portalTitle: 'Departamento en venta en Palermo; "luminoso"',
    publishAddress: 'Gurruchaga al 1800',
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
    coverImageUrl: undefined,
    coordinates: undefined,
    producer: { id: '00000000-0000-7000-8000-0000000000a1', name: 'Camila Ruiz' },
    createdAt: new Date('2026-09-01T12:00:00Z'),
    updatedAt: new Date('2026-09-30T02:00:00Z'),
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

async function read(body: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

describe('FilePropertyExportWriter', () => {
  const writer = new FilePropertyExportWriter();

  it('writes a CSV that Excel opens in Spanish, with exact prices and local dates', async () => {
    const file = writer.write('csv', batches([row()], [row({ code: 'DEP0002' })]), {
      generatedAt: GENERATED_AT,
    });
    const text = (await read(file.body)).toString('utf8');
    const lines = text.split('\r\n');

    expect(file).toMatchObject({
      filename: 'propiedades-2026-10-01.csv',
      contentType: 'text/csv; charset=utf-8',
    });
    expect(text.startsWith('﻿Código;Tipo;Estado;')).toBe(true);
    expect(lines[1]).toContain(
      'DEP0001;Departamento;Disponible;"Departamento en venta en Palermo; ""luminoso"""',
    );
    expect(lines[1]).toContain('USD;120000.50;ARS;Consultar;;');
    // El 30/09 a las 02:00 UTC todavía es el 29/09 en Buenos Aires.
    expect(lines[1]).toContain('Camila Ruiz;01/09/2026;29/09/2026');
    expect(lines[2]?.startsWith('DEP0002;')).toBe(true);
  });

  it('writes an Excel sheet with a header row and one row per property', async () => {
    const file = writer.write('xlsx', batches([row(), row({ code: 'DEP0002' })]), {
      generatedAt: GENERATED_AT,
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.read(Readable.from(file.body));
    const sheet = workbook.getWorksheet('Propiedades');

    expect(sheet?.rowCount).toBe(3);
    expect(sheet?.getRow(1).getCell(1).value).toBe('Código');
    expect(sheet?.getRow(3).getCell(1).value).toBe('DEP0002');
    expect(sheet?.getRow(2).getCell(10).value).toBe('120000.50');
  });

  it('writes a PDF with one block per property', async () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      row({ code: `DEP${String(i).padStart(4, '0')}` }),
    );
    const file = writer.write('pdf', batches(many), { generatedAt: GENERATED_AT });
    const bytes = await read(file.body);

    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe('Propiedades');
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
