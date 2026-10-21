import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import type { SpreadsheetRow } from '@norde/core/shared';

import { parseCsv } from './csv-spreadsheet-reader';
import { UploadedSpreadsheetReader } from './uploaded-spreadsheet-reader';

async function collect(rows: AsyncIterable<SpreadsheetRow>): Promise<SpreadsheetRow[]> {
  const out: SpreadsheetRow[] = [];
  for await (const row of rows) out.push(row);
  return out;
}

/** Un `.xls` (BIFF8) como el que exporta Tokko. */
function xls(rows: unknown[][], cells: Record<string, XLSX.CellObject> = {}): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  Object.assign(sheet, cells);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Contactos');
  // `write` con `type: 'array'` devuelve un ArrayBuffer (el tipo de SheetJS es `any`).
  return new Uint8Array(XLSX.write(workbook, { bookType: 'xls', type: 'array' }) as ArrayBuffer);
}

const csv = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('UploadedSpreadsheetReader', () => {
  const reader = new UploadedSpreadsheetReader();

  it('reads an .xls: integers without scientific notation, dates as ISO, empty rows skipped', async () => {
    const bytes = xls(
      [
        ['ID', 'Nombre', 'Celular', 'Fecha de nacimiento', 'Alta'],
        [12345678, 'Ana Pérez', 5491166899124, '-', 0],
        [],
        [7654321, '  Juan  ', null, null, null],
      ],
      // 42216 es el 31/07/2015 en Excel.
      { E2: { t: 'n', v: 42216, z: 'dd-mm-yyyy' } },
    );

    const sheet = await reader.open(bytes);
    if (sheet.isErr()) throw new Error('Expected a readable sheet');

    expect(sheet.value.headers).toEqual(['ID', 'Nombre', 'Celular', 'Fecha de nacimiento', 'Alta']);
    expect(sheet.value.rowCount).toBe(2);
    expect(await collect(sheet.value.rows())).toEqual([
      { rowNumber: 2, cells: ['12345678', 'Ana Pérez', '5491166899124', '-', '2015-07-31'] },
      { rowNumber: 4, cells: ['7654321', 'Juan', undefined, undefined, undefined] },
    ]);
  });

  it('still reads an .xlsx', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Hoja');
    sheet.addRow(['Nombre', 'Email']);
    sheet.addRow(['Ana', 'ana@mail.com']);
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());

    const read = await reader.open(bytes);

    expect(read.isOk() && read.value.headers).toEqual(['Nombre', 'Email']);
  });

  it('reads a UTF-8 .csv with a BOM, quoted commas and line breaks, keeping values as text', async () => {
    const bytes = csv(
      '﻿Ref,Dirección,Venta,Fecha de creación\r\n' +
        'NPH1,"Cafayate 1581, PB",USD 119.000,11-07-2017\r\n' +
        ',,,\r\n' +
        'NPH2,"Dice ""hola""\nen dos líneas",-,12-07-2017\r\n',
    );

    const sheet = await reader.open(bytes);
    if (sheet.isErr()) throw new Error('Expected a readable sheet');

    expect(sheet.value.headers).toEqual(['Ref', 'Dirección', 'Venta', 'Fecha de creación']);
    expect(await collect(sheet.value.rows())).toEqual([
      { rowNumber: 2, cells: ['NPH1', 'Cafayate 1581, PB', 'USD 119.000', '11-07-2017'] },
      { rowNumber: 4, cells: ['NPH2', 'Dice "hola"\nen dos líneas', '-', '12-07-2017'] },
    ]);
  });

  it('reads a semicolon .csv saved by Excel in Windows-1252', async () => {
    // "Teléfono" en Windows-1252: la é es 0xE9.
    const bytes = new Uint8Array([...csv('Nombre;Tel'), 0xe9, ...csv('fono\nAna;1144556677\n')]);

    const sheet = await reader.open(bytes);
    if (sheet.isErr()) throw new Error('Expected a readable sheet');

    expect(sheet.value.headers).toEqual(['Nombre', 'Teléfono']);
    expect(await collect(sheet.value.rows())).toEqual([
      { rowNumber: 2, cells: ['Ana', '1144556677'] },
    ]);
  });

  it('rejects a binary file that is not a spreadsheet', async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0x01, 0x02]);

    expect(await reader.open(pdf)).toMatchObject({ error: { type: 'UnreadableSpreadsheet' } });
  });

  it('rejects an empty text file and a broken .xls', async () => {
    expect(await reader.open(csv('\n\n'))).toMatchObject({
      error: { type: 'UnreadableSpreadsheet' },
    });
    const broken = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0x01, 0x02, 0x03]);
    expect(await reader.open(broken)).toMatchObject({ error: { type: 'UnreadableSpreadsheet' } });
  });
});

describe('parseCsv', () => {
  it('keeps an empty last field and a final line without a line break', () => {
    expect(parseCsv('a,b,\n1,2,3', ',')).toEqual([
      ['a', 'b', ''],
      ['1', '2', '3'],
    ]);
  });
});
