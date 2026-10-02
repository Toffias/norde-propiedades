import { Readable } from 'node:stream';

import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import type { ClientListRow } from '@norde/core/clients';

import { XlsxClientExportWriter } from './client-export-writer';

const GENERATED_AT = new Date('2026-10-01T15:00:00Z');

function row(overrides: Partial<ClientListRow> = {}): ClientListRow {
  return {
    id: '00000000-0000-7000-8000-0000000000d1',
    kind: 'person',
    name: 'Ana Pérez',
    companyName: 'Acme',
    phone: '+541147770000',
    mobile: '+5491166899124',
    email: 'ana@mail.com',
    clientTypes: ['buyer', 'owner_seller'],
    agent: { id: '00000000-0000-7000-8000-0000000000a1', name: 'Camila Ruiz' },
    contactMasked: false,
    createdAt: new Date('2026-09-01T12:00:00Z'),
    updatedAt: new Date('2026-09-30T02:00:00Z'),
    deletedAt: undefined,
    deletedBy: undefined,
    ...overrides,
  };
}

async function* batches(...lists: ClientListRow[][]) {
  for (const list of lists) {
    await Promise.resolve();
    yield list;
  }
}

describe('XlsxClientExportWriter', () => {
  it('writes one row per contact, batch after batch, with Spanish labels and local dates', async () => {
    const file = new XlsxClientExportWriter().write(
      batches([row()], [row({ name: 'Bruno', clientTypes: [], agent: undefined })]),
      { generatedAt: GENERATED_AT },
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.read(Readable.from(file.body));
    const sheet = workbook.getWorksheet('Contactos');

    expect(file.filename).toBe('contactos-2026-10-01.xlsx');
    expect(sheet?.rowCount).toBe(3);
    expect(sheet?.getRow(1).getCell(1).value).toBe('Nombre');
    expect(sheet?.getRow(2).getCell(7).value).toBe('Comprador, Propietario vendedor');
    expect(sheet?.getRow(2).getCell(8).value).toBe('Camila Ruiz');
    // 02:00 UTC del 30 es el 29 en Buenos Aires.
    expect(sheet?.getRow(2).getCell(10).value).toBe('29/09/2026');
    expect(sheet?.getRow(3).getCell(1).value).toBe('Bruno');
    expect(sheet?.getRow(3).getCell(7).value).toBeNull();
  });
});
