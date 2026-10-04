import { PassThrough } from 'node:stream';

import {
  PROPERTY_KIND_LABELS,
  type ExportFile,
  type ReservationExportWriter,
} from '@norde/core/properties';
import type {
  MoneyDto,
  ReservationListRow,
  ReservationStatusValue,
} from '@norde/core/properties/contracts';
import ExcelJS from 'exceljs';

// Excel del listado de reservas (`/reservas`). Se arma a medida que llegan los lotes.

const STATUS_LABELS: Readonly<Record<ReservationStatusValue, string>> = {
  active: 'Activa',
  fallen: 'Caída',
  signed: 'Firmada',
};

const OPERATION_LABELS = { sale: 'Venta', rent: 'Alquiler', temporary_rent: 'Temporario' } as const;

const TIME_ZONE = 'America/Argentina/Buenos_Aires';
/** `AAAA-MM-DD` de Buenos Aires, para el nombre del archivo. */
const isoDay = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE });
const dateFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** `AAAA-MM-DD` (fecha sin hora) → `DD/MM/AAAA`. */
function dateOnly(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const [year, month, day] = value.split('-');
  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

/**
 * Centavos → el monto de la celda. Uno entero va como número, para poder sumarlo; con centavos, como
 * texto exacto ("150000.50").
 */
function amount(money: MoneyDto | undefined): number | string | undefined {
  if (money === undefined) return undefined;
  const cents = money.amountCents;
  if (cents % 100n === 0n) return Number(cents / 100n);
  return `${(cents / 100n).toString()}.${(cents % 100n).toString().padStart(2, '0')}`;
}

type Cell = string | number | undefined;

interface Column {
  readonly header: string;
  readonly width: number;
  readonly value: (row: ReservationListRow) => Cell;
}

const COLUMNS: readonly Column[] = [
  { header: 'Propiedad', width: 12, value: (r) => r.property.code },
  { header: 'Tipo', width: 14, value: (r) => PROPERTY_KIND_LABELS[r.property.propertyType] },
  { header: 'Dirección', width: 32, value: (r) => r.property.address },
  { header: 'Operación', width: 12, value: (r) => OPERATION_LABELS[r.operation] },
  { header: 'Estado', width: 10, value: (r) => STATUS_LABELS[r.status] },
  {
    header: 'Cliente',
    width: 26,
    value: (r) => r.client.name ?? 'Contacto en la papelera',
  },
  { header: 'Agente', width: 22, value: (r) => r.agent?.name },
  { header: 'Gerente', width: 22, value: (r) => r.manager?.name },
  { header: 'Moneda', width: 8, value: (r) => r.amount?.currency },
  { header: 'Valor', width: 14, value: (r) => amount(r.amount) },
  { header: 'Comisión (%)', width: 12, value: (r) => r.commissionPct },
  { header: 'Comisión: moneda', width: 10, value: (r) => r.commission?.currency },
  { header: 'Comisión: monto', width: 14, value: (r) => amount(r.commission) },
  { header: 'Fecha de reserva', width: 12, value: (r) => dateFormat.format(r.reservedAt) },
  {
    header: 'Fecha estimada de firma',
    width: 12,
    value: (r) => dateOnly(r.estimatedSigningDate),
  },
  {
    header: 'Firmada',
    width: 12,
    value: (r) => (r.signedAt === undefined ? undefined : dateFormat.format(r.signedAt)),
  },
  {
    header: 'Caída',
    width: 12,
    value: (r) => (r.fallenAt === undefined ? undefined : dateFormat.format(r.fallenAt)),
  },
  { header: 'Motivo de la caída', width: 30, value: (r) => r.fallenReason },
  { header: 'Notas', width: 40, value: (r) => r.notes },
];

/** Excel con exceljs, en streaming. */
export class XlsxReservationExportWriter implements ReservationExportWriter {
  write(
    batches: AsyncIterable<readonly ReservationListRow[]>,
    meta: { readonly generatedAt: Date },
  ): ExportFile {
    return {
      filename: `reservas-${isoDay.format(meta.generatedAt)}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: xlsx(batches),
    };
  }
}

function xlsx(batches: AsyncIterable<readonly ReservationListRow[]>): AsyncIterable<Uint8Array> {
  const stream = new PassThrough();
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });
  const sheet = workbook.addWorksheet('Reservas', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = COLUMNS.map((c, index) => ({
    header: c.header,
    key: String(index),
    width: c.width,
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).commit();

  void (async () => {
    try {
      for await (const batch of batches) {
        for (const row of batch) {
          sheet.addRow(COLUMNS.map((c) => c.value(row) ?? null)).commit();
        }
      }
      sheet.commit();
      await workbook.commit();
    } catch (error) {
      // El error llega a quien lee el archivo: la descarga se corta en vez de quedar incompleta.
      stream.destroy(error instanceof Error ? error : new Error(String(error)));
    }
  })();
  return stream;
}
