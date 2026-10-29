import { PassThrough } from 'node:stream';

import {
  OPERATIONS,
  PROPERTY_KIND_LABELS,
  type ExportFile,
  type PanelPropertyRow,
  type PropertyExportFormat,
  type PropertyExportWriter,
  type PropertyStatusValue,
} from '@norde/core/properties';
import ExcelJS from 'exceljs';

// Planilla (CSV o Excel) de una exportación de propiedades. Arma el archivo a medida que llegan los
// lotes; nunca tiene la exportación entera en memoria. El PDF de la selección es otro pedido (#175).

const STATUS_LABELS: Readonly<Record<PropertyStatusValue, string>> = {
  draft: 'Borrador',
  available: 'Disponible',
  reserved: 'Reservada',
  sold: 'Vendida',
  rented: 'Alquilada',
  paused: 'Pausada',
  withdrawn: 'Dada de baja',
};

const OPERATION_LABELS = { sale: 'Venta', rent: 'Alquiler', temporary_rent: 'Temporario' } as const;

const TIME_ZONE = 'America/Argentina/Buenos_Aires';
const dateFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Centavos → unidades con dos decimales, exacto ("150000.50"). */
function units(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const abs = cents < 0n ? -cents : cents;
  return `${sign}${(abs / 100n).toString()}.${(abs % 100n).toString().padStart(2, '0')}`;
}

type Cell = string | number | undefined;

interface Column {
  readonly header: string;
  readonly width: number;
  readonly value: (row: PanelPropertyRow) => Cell;
}

const COLUMNS: readonly Column[] = [
  { header: 'Código', width: 12, value: (r) => r.code },
  { header: 'Tipo', width: 14, value: (r) => PROPERTY_KIND_LABELS[r.propertyType] },
  { header: 'Estado', width: 14, value: (r) => STATUS_LABELS[r.status] },
  { header: 'Título', width: 40, value: (r) => r.portalTitle },
  { header: 'Dirección para publicar', width: 30, value: (r) => r.publishAddress },
  { header: 'Barrio', width: 18, value: (r) => r.neighborhood },
  { header: 'Localidad', width: 18, value: (r) => r.city },
  { header: 'Provincia', width: 18, value: (r) => r.province },
  ...OPERATIONS.flatMap((operation): Column[] => {
    const find = (r: PanelPropertyRow) => r.operations.find((o) => o.operation === operation);
    return [
      {
        header: `${OPERATION_LABELS[operation]}: moneda`,
        width: 10,
        value: (r) => find(r)?.currency,
      },
      {
        header: `${OPERATION_LABELS[operation]}: precio`,
        width: 14,
        value: (r) => {
          const found = find(r);
          if (found === undefined) return undefined;
          return found.priceCents === null ? 'Consultar' : units(found.priceCents);
        },
      },
    ];
  }),
  { header: 'Ambientes', width: 10, value: (r) => r.attributes.rooms },
  { header: 'Dormitorios', width: 11, value: (r) => r.attributes.bedrooms },
  { header: 'Baños', width: 8, value: (r) => r.attributes.bathrooms },
  { header: 'Cocheras', width: 9, value: (r) => r.attributes.parkingSpaces },
  { header: 'Antigüedad (años)', width: 12, value: (r) => r.attributes.ageYears },
  { header: 'Sup. total (m²)', width: 12, value: (r) => r.attributes.surfaceTotalM2 },
  { header: 'Sup. cubierta (m²)', width: 12, value: (r) => r.attributes.surfaceCoveredM2 },
  { header: 'Captador', width: 22, value: (r) => r.producer?.name },
  { header: 'Alta', width: 12, value: (r) => dateFormat.format(r.createdAt) },
  { header: 'Última actualización', width: 12, value: (r) => dateFormat.format(r.updatedAt) },
];

const encoder = new TextEncoder();

/** CSV con `;` y BOM: así lo abre bien Excel con configuración regional de Argentina. */
function csvCell(value: Cell): string {
  if (value === undefined) return '';
  const text = String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function* csv(
  batches: AsyncIterable<readonly PanelPropertyRow[]>,
): AsyncIterable<Uint8Array> {
  yield encoder.encode(`\uFEFF${COLUMNS.map((c) => csvCell(c.header)).join(';')}\r\n`);
  for await (const batch of batches) {
    const lines = batch.map((row) => COLUMNS.map((c) => csvCell(c.value(row))).join(';'));
    yield encoder.encode(`${lines.join('\r\n')}\r\n`);
  }
}

function xlsx(batches: AsyncIterable<readonly PanelPropertyRow[]>): AsyncIterable<Uint8Array> {
  const stream = new PassThrough();
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });
  const sheet = workbook.addWorksheet('Propiedades', { views: [{ state: 'frozen', ySplit: 1 }] });
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

const CONTENT_TYPES: Readonly<Record<PropertyExportFormat, string>> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** CSV a mano y Excel con exceljs (en streaming). */
export class FilePropertyExportWriter implements PropertyExportWriter {
  write(
    format: PropertyExportFormat,
    batches: AsyncIterable<readonly PanelPropertyRow[]>,
    meta: { readonly generatedAt: Date },
  ): ExportFile {
    const day = meta.generatedAt.toISOString().slice(0, 10);
    const body = format === 'csv' ? csv(batches) : xlsx(batches);
    return { filename: `propiedades-${day}.${format}`, contentType: CONTENT_TYPES[format], body };
  }
}
