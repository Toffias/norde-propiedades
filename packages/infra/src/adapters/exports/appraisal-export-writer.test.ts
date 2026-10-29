import { Readable } from 'node:stream';

import type { AppraisalExportRow } from '@norde/core/appraisals/contracts';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { XlsxAppraisalExportWriter } from './appraisal-export-writer';

function row(overrides: Partial<AppraisalExportRow> = {}): AppraisalExportRow {
  return {
    id: '00000000-0000-7000-8000-0000000000f1',
    code: 'TAS0001',
    status: 'appraised',
    propertyType: 'house',
    address: 'Mitre 1234',
    requester: { id: '00000000-0000-7000-8000-0000000000d1', name: 'Ana Pérez' },
    producer: { id: '00000000-0000-7000-8000-0000000000a1', name: 'Camila Díaz' },
    appraiser: undefined,
    branch: { id: '00000000-0000-7000-8000-0000000000b1', name: 'Centro' },
    visitAt: undefined,
    createdAt: new Date('2026-10-01T01:00:00Z'),
    updatedAt: new Date('2026-10-02T15:00:00Z'),
    deletedAt: undefined,
    rooms: 4,
    surfaceTotalM2: 300,
    surfaceCoveredM2: 180.5,
    sale: { minCents: 11_000_000n, maxCents: 12_000_050n, currency: 'USD' },
    rent: undefined,
    ...overrides,
  };
}

async function* batches(...lists: AppraisalExportRow[][]) {
  for (const list of lists) {
    await Promise.resolve();
    yield list;
  }
}

async function sheetOf(body: AsyncIterable<Uint8Array>): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.read(Readable.from(body));
  const sheet = workbook.getWorksheet('Tasaciones');
  if (sheet === undefined) throw new Error('Missing sheet');
  return sheet;
}

/** Los valores de una fila, por encabezado. */
function byHeader(sheet: ExcelJS.Worksheet, rowNumber: number): Map<string, ExcelJS.CellValue> {
  const headers = sheet.getRow(1);
  const values = new Map<string, ExcelJS.CellValue>();
  headers.eachCell((cell, column) => {
    values.set(
      typeof cell.value === 'string' ? cell.value : '',
      sheet.getRow(rowNumber).getCell(column).value,
    );
  });
  return values;
}

describe('XlsxAppraisalExportWriter', () => {
  it('names the file with the day in Buenos Aires', () => {
    const file = new XlsxAppraisalExportWriter().write(batches(), {
      generatedAt: new Date('2026-10-04T01:00:00Z'),
    });
    expect(file.filename).toBe('tasaciones-2026-10-03.xlsx');
  });

  it('writes numbers, amounts and days as typed cells', async () => {
    const file = new XlsxAppraisalExportWriter().write(
      batches(
        [row()],
        [row({ code: 'TAS0002', sale: undefined, requester: { id: 'x', name: undefined } })],
      ),
      { generatedAt: new Date('2026-10-04T12:00:00Z') },
    );
    const sheet = await sheetOf(file.body);

    expect(sheet.rowCount).toBe(3);
    const first = byHeader(sheet, 2);
    expect(first.get('Código')).toBe('TAS0001');
    expect(first.get('Estado')).toBe('Tasada');
    expect(first.get('Solicitante')).toBe('Ana Pérez');
    expect(first.get('Sucursal')).toBe('Centro');
    expect(first.get('Sup. cubierta (m²)')).toBe(180.5);
    expect(first.get('Venta: moneda')).toBe('USD');
    expect(first.get('Venta: desde')).toBe(110_000);
    expect(first.get('Venta: hasta')).toBe(120_000.5);
    expect(first.get('Alquiler: desde')).toBeNull();
    // El alta fue el 30/09 en Buenos Aires (01:00 UTC del 1/10).
    expect(first.get('Alta')).toEqual(new Date('2026-09-30T00:00:00.000Z'));
    expect(sheet.getRow(2).getCell(13).numFmt).toBe('#,##0');
    expect(sheet.getRow(2).getCell(14).numFmt).toBe('#,##0.00');

    const second = byHeader(sheet, 3);
    expect(second.get('Solicitante')).toBe('Contacto en la papelera');
    expect(second.get('Venta: desde')).toBeNull();
  });
});
