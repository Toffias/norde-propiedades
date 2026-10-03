import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import type { SpreadsheetRow } from '@norde/core/shared';

import { XlsxSpreadsheetReader } from './xlsx-spreadsheet-reader';

async function xlsx(rows: readonly ExcelJS.CellValue[][]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Contactos');
  for (const row of rows) sheet.addRow(row);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function collect(rows: AsyncIterable<SpreadsheetRow>): Promise<SpreadsheetRow[]> {
  const out: SpreadsheetRow[] = [];
  for await (const row of rows) out.push(row);
  return out;
}

describe('XlsxSpreadsheetReader', () => {
  it('reads the headers and the text of each cell, skipping empty rows', async () => {
    const bytes = await xlsx([
      ['Nombre', 'Celular', 'Email', 'Nacimiento', ''],
      [
        'Ana Pérez',
        5491166899124,
        { text: 'ana@mail.com', hyperlink: 'mailto:ana@mail.com' },
        new Date('1990-03-07T00:00:00Z'),
      ],
      [],
      [
        { richText: [{ text: 'Juan ' }, { text: 'Gómez' }] },
        { formula: '1+1', result: 2 },
        '  ',
        null,
      ],
    ]);

    const sheet = await new XlsxSpreadsheetReader().open(bytes);
    if (sheet.isErr()) throw new Error('Expected a readable sheet');

    expect(sheet.value.headers).toEqual(['Nombre', 'Celular', 'Email', 'Nacimiento']);
    expect(sheet.value.rowCount).toBe(2);
    expect(await collect(sheet.value.rows())).toEqual([
      { rowNumber: 2, cells: ['Ana Pérez', '5491166899124', 'ana@mail.com', '1990-03-07'] },
      { rowNumber: 4, cells: ['Juan Gómez', '2', undefined, undefined] },
    ]);
  });

  it('names the columns without a header', async () => {
    const bytes = await xlsx([
      [null, 'Email'],
      ['Ana', 'a@b.com'],
    ]);

    const sheet = await new XlsxSpreadsheetReader().open(bytes);

    expect(sheet.isOk() && sheet.value.headers).toEqual(['Columna 1', 'Email']);
  });

  it('reports a file that is not an Excel', async () => {
    const sheet = await new XlsxSpreadsheetReader().open(new TextEncoder().encode('a,b\n1,2'));

    expect(sheet.isErr() && sheet.error).toEqual({ type: 'UnreadableSpreadsheet' });
  });
});
