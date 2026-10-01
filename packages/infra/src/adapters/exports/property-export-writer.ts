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
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

// Planilla (CSV, Excel) y PDF de una exportación de propiedades. Arma el archivo a medida que llegan
// los lotes; nunca tiene la exportación entera en memoria, salvo el PDF (que tiene un tope).

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

// ---------- PDF ----------

const PAGE = { width: 595.28, height: 841.89, margin: 40 } as const;

/** Las fuentes estándar del PDF solo tienen Latin-1: lo demás se reemplaza. */
function printable(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, '');
}

function money(row: PanelPropertyRow): string {
  if (row.operations.length === 0) return 'Sin operación cargada';
  return row.operations
    .map((o) => {
      const price =
        o.priceCents === null
          ? 'Consultar'
          : `${o.currency} ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(Number(units(o.priceCents)))}`;
      return `${OPERATION_LABELS[o.operation]}: ${price}`;
    })
    .join('   ');
}

function details(row: PanelPropertyRow): string {
  const a = row.attributes;
  return [
    a.rooms === undefined ? undefined : `${a.rooms} amb.`,
    a.bedrooms === undefined ? undefined : `${a.bedrooms} dorm.`,
    a.bathrooms === undefined ? undefined : `${a.bathrooms} baños`,
    a.parkingSpaces === undefined ? undefined : `${a.parkingSpaces} cocheras`,
    a.surfaceTotalM2 === undefined ? undefined : `${a.surfaceTotalM2} m² totales`,
    a.surfaceCoveredM2 === undefined ? undefined : `${a.surfaceCoveredM2} m² cubiertos`,
    a.ageYears === undefined ? undefined : `${a.ageYears} años`,
  ]
    .filter((part) => part !== undefined)
    .join(' · ');
}

class PdfCursor {
  page: PDFPage;
  y: number;

  constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: { readonly regular: PDFFont; readonly bold: PDFFont },
  ) {
    this.page = doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
  }

  /** Salta de página si el bloque que sigue no entra. */
  ensure(height: number): void {
    if (this.y - height >= PAGE.margin) return;
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
  }

  line(
    text: string,
    options: { readonly size: number; readonly bold?: boolean; readonly muted?: boolean },
  ) {
    const font = options.bold ? this.fonts.bold : this.fonts.regular;
    const maxWidth = PAGE.width - PAGE.margin * 2;
    let content = printable(text);
    while (content.length > 1 && font.widthOfTextAtSize(content, options.size) > maxWidth) {
      content = `${content.slice(0, -2)}…`;
    }
    this.ensure(options.size + 4);
    this.y -= options.size + 4;
    this.page.drawText(content, {
      x: PAGE.margin,
      y: this.y,
      size: options.size,
      font,
      color: options.muted ? rgb(0.4, 0.4, 0.4) : rgb(0.1, 0.1, 0.1),
    });
  }

  gap(height: number): void {
    this.y -= height;
  }
}

function pdf(
  batches: AsyncIterable<readonly PanelPropertyRow[]>,
  generatedAt: Date,
): AsyncIterable<Uint8Array> {
  return (async function* () {
    const doc = await PDFDocument.create();
    doc.setTitle('Propiedades');
    doc.setCreator('Norde Propiedades');
    const fonts = {
      regular: await doc.embedFont(StandardFonts.Helvetica),
      bold: await doc.embedFont(StandardFonts.HelveticaBold),
    };
    const cursor = new PdfCursor(doc, fonts);
    cursor.line('Propiedades', { size: 18, bold: true });
    cursor.line(`Generado el ${dateFormat.format(generatedAt)}`, { size: 9, muted: true });
    cursor.gap(12);

    for await (const batch of batches) {
      for (const row of batch) {
        cursor.ensure(80);
        cursor.line(`${row.code} · ${row.portalTitle}`, { size: 12, bold: true });
        cursor.line(
          `${PROPERTY_KIND_LABELS[row.propertyType]} · ${STATUS_LABELS[row.status]} · ${[
            row.publishAddress,
            row.neighborhood,
            row.city,
          ]
            .filter((part) => part !== undefined && part !== '')
            .join(', ')}`,
          { size: 9, muted: true },
        );
        cursor.line(money(row), { size: 10 });
        const extra = details(row);
        if (extra !== '') cursor.line(extra, { size: 9 });
        cursor.gap(10);
      }
    }
    yield await doc.save();
  })();
}

const CONTENT_TYPES: Readonly<Record<PropertyExportFormat, string>> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

/** CSV a mano, Excel con exceljs (en streaming) y PDF con pdf-lib. */
export class FilePropertyExportWriter implements PropertyExportWriter {
  write(
    format: PropertyExportFormat,
    batches: AsyncIterable<readonly PanelPropertyRow[]>,
    meta: { readonly generatedAt: Date },
  ): ExportFile {
    const day = meta.generatedAt.toISOString().slice(0, 10);
    const body =
      format === 'csv'
        ? csv(batches)
        : format === 'xlsx'
          ? xlsx(batches)
          : pdf(batches, meta.generatedAt);
    return { filename: `propiedades-${day}.${format}`, contentType: CONTENT_TYPES[format], body };
  }
}
