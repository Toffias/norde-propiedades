import { describe, expect, it } from 'vitest';

import type { ReservationListRow } from '@norde/core/properties/contracts';

import { XlsxSpreadsheetReader } from '../imports/xlsx-spreadsheet-reader';

import { XlsxReservationExportWriter } from './reservation-export-writer';

function row(overrides: Partial<ReservationListRow> = {}): ReservationListRow {
  return {
    id: '00000000-0000-7000-8000-0000000000f1',
    propertyId: '00000000-0000-7000-8000-0000000000c1',
    property: {
      id: '00000000-0000-7000-8000-0000000000c1',
      code: 'P-001',
      propertyType: 'apartment',
      address: 'Güemes 123',
    },
    client: { id: '00000000-0000-7000-8000-0000000000d1', name: 'Lucía Pérez' },
    opportunityId: undefined,
    agent: { id: '00000000-0000-7000-8000-0000000000a1', name: 'Camila Ríos' },
    manager: undefined,
    operation: 'sale',
    amount: { amountCents: 15_000_000n, currency: 'USD' },
    commissionPct: 3.5,
    commission: { amountCents: 450_050n, currency: 'USD' },
    status: 'active',
    reservedAt: new Date('2026-09-20T12:00:00Z'),
    estimatedSigningDate: '2026-11-15',
    fallenAt: undefined,
    fallenReason: undefined,
    signedAt: undefined,
    notes: undefined,
    ...overrides,
  };
}

async function* batches(...lists: ReservationListRow[][]) {
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

describe('XlsxReservationExportWriter', () => {
  it('names the file with the day in Buenos Aires', () => {
    const file = new XlsxReservationExportWriter().write(batches(), {
      generatedAt: new Date('2026-10-04T01:00:00Z'),
    });
    expect(file.filename).toBe('reservas-2026-10-03.xlsx');
  });

  it('writes one row per reservation, readable back', async () => {
    const file = new XlsxReservationExportWriter().write(
      batches(
        [row()],
        [
          row({
            property: {
              id: '00000000-0000-7000-8000-0000000000c2',
              code: 'P-002',
              propertyType: 'house',
              address: 'Casa en Yerba Buena',
            },
            client: { id: '00000000-0000-7000-8000-0000000000d2', name: undefined },
            agent: undefined,
            manager: { id: '00000000-0000-7000-8000-0000000000a4', name: 'Martín Gómez' },
            operation: 'rent',
            amount: undefined,
            commissionPct: undefined,
            commission: undefined,
            status: 'fallen',
            estimatedSigningDate: undefined,
            fallenAt: new Date('2026-09-25T15:00:00Z'),
            fallenReason: 'No consiguió el crédito',
          }),
        ],
      ),
      { generatedAt: new Date('2026-10-04T12:00:00Z') },
    );

    const sheet = await new XlsxSpreadsheetReader().open(await bytesOf(file.body));
    if (sheet.isErr()) throw new Error('The export is not a readable Excel');
    expect(sheet.value.headers.slice(0, 6)).toEqual([
      'Propiedad',
      'Tipo',
      'Dirección',
      'Operación',
      'Estado',
      'Cliente',
    ]);

    const rows = [];
    for await (const read of sheet.value.rows()) rows.push(read.cells);
    expect(rows).toEqual([
      [
        'P-001',
        'Departamento',
        'Güemes 123',
        'Venta',
        'Activa',
        'Lucía Pérez',
        'Camila Ríos',
        undefined,
        'USD',
        '150000',
        '3.5',
        'USD',
        '4500.50',
        '20/09/2026',
        '15/11/2026',
        undefined,
        undefined,
        undefined,
        undefined,
      ],
      [
        'P-002',
        'Casa',
        'Casa en Yerba Buena',
        'Alquiler',
        'Caída',
        'Contacto en la papelera',
        undefined,
        'Martín Gómez',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        '20/09/2026',
        undefined,
        undefined,
        '25/09/2026',
        'No consiguió el crédito',
        undefined,
      ],
    ]);
  });
});
