import type { AppraisalReportContent, AppraisalReportRenderer } from '@norde/core/appraisals';
import type {
  AppraisalComparableRow,
  AppraisalDetail,
  AppraisalValueRangeDto,
} from '@norde/core/appraisals/contracts';
import { PROPERTY_KIND_LABELS, PROPERTY_KINDS } from '@norde/core/properties';
import { PDFDocument, StandardFonts, type PDFImage } from 'pdf-lib';
import sharp from 'sharp';

import {
  CONDITION_LABELS,
  CONTENT_WIDTH,
  Cursor,
  dateFormat,
  embed,
  MUTED,
  money,
  numberFormat,
  PAGE,
  printable,
  twoColumns,
} from './pdf-kit';

// El informe de la tasación con pdf-lib, en español: lo que se le entrega al propietario con la
// marca de la empresa. Valores sugeridos, comparables, observaciones y fotos.

/** Lado mayor de las fotos en el PDF: alcanza para imprimir y el archivo no pesa de más. */
const PHOTO_MAX_SIDE = 1400;
const PHOTO_GAP = 12;

/** Columnas de la tabla de comparables: dirección, precio, superficie y valor por m². */
const COLUMNS = [
  { title: 'Dirección', width: 215 },
  { title: 'Precio', width: 110 },
  { title: 'Superficie', width: 80 },
  { title: 'Valor por m2', width: CONTENT_WIDTH - 215 - 110 - 80 },
] as const;

function kindLabel(kind: string): string {
  const known = PROPERTY_KINDS.find((candidate) => candidate === kind);
  return known === undefined ? kind : PROPERTY_KIND_LABELS[known];
}

/** "USD 110.000 a USD 120.000", o un solo monto si el mínimo y el máximo coinciden. */
function range(value: AppraisalValueRangeDto): string {
  const min = money(value.currency, value.minCents);
  return value.minCents === value.maxCents
    ? min
    : `${min} a ${money(value.currency, value.maxCents)}`;
}

/** "1 baño", "2 baños". */
function count(value: number | undefined, one: string, many: string): string | undefined {
  return value === undefined ? undefined : `${value.toString()} ${value === 1 ? one : many}`;
}

function characteristics(appraisal: AppraisalDetail): string[] {
  return [
    appraisal.surfaceTotalM2 === undefined
      ? undefined
      : `${numberFormat.format(appraisal.surfaceTotalM2)} m2 totales`,
    appraisal.surfaceCoveredM2 === undefined
      ? undefined
      : `${numberFormat.format(appraisal.surfaceCoveredM2)} m2 cubiertos`,
    count(appraisal.rooms, 'ambiente', 'ambientes'),
    count(appraisal.bedrooms, 'dormitorio', 'dormitorios'),
    count(appraisal.bathrooms, 'baño', 'baños'),
    appraisal.condition === undefined
      ? undefined
      : `Estado: ${CONDITION_LABELS[appraisal.condition] ?? appraisal.condition}`,
  ].filter((part): part is string => part !== undefined);
}

/**
 * La foto, enderezada según el EXIF y achicada a JPEG. `undefined` si no es una imagen que sharp
 * pueda leer: el informe sale sin ella.
 */
async function printablePhoto(bytes: Uint8Array): Promise<Uint8Array | undefined> {
  try {
    const jpeg = await sharp(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))
      .rotate()
      .resize({
        width: PHOTO_MAX_SIDE,
        height: PHOTO_MAX_SIDE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
    return new Uint8Array(jpeg);
  } catch {
    // sharp lanza ante bytes que no son una imagen soportada: es un dato inválido, no un fallo.
    return undefined;
  }
}

async function header(cursor: Cursor, doc: PDFDocument, content: AppraisalReportContent) {
  const logo =
    content.company.logo === undefined ? undefined : await embed(doc, content.company.logo);
  const top = cursor.y;
  if (logo) {
    const scale = Math.min(120 / logo.width, 40 / logo.height);
    cursor.page.drawImage(logo, {
      x: PAGE.margin,
      y: top - logo.height * scale,
      width: logo.width * scale,
      height: logo.height * scale,
    });
  } else {
    cursor.text(content.company.name, { size: 14, bold: true });
  }
  const code = printable(`Tasación ${content.appraisal.code}`);
  cursor.page.drawText(code, {
    x: PAGE.width - PAGE.margin - cursor.fonts.bold.widthOfTextAtSize(code, 10),
    y: top - 14,
    size: 10,
    font: cursor.fonts.bold,
    color: MUTED,
  });
  cursor.y = top - 48;
  cursor.rule();
}

function summary(cursor: Cursor, content: AppraisalReportContent) {
  const { appraisal } = content;
  cursor.text('Informe de tasación', { size: 18, bold: true });
  cursor.text(
    [kindLabel(appraisal.propertyType), appraisal.address]
      .filter((part) => part !== undefined && part !== '')
      .join(' · '),
    { size: 11, muted: true },
  );
  const people = [
    appraisal.requester.name === undefined
      ? undefined
      : `Preparado para ${appraisal.requester.name}`,
    appraisal.appraiser?.name === undefined ? undefined : `Tasó ${appraisal.appraiser.name}`,
    dateFormat.format(content.generatedAt),
  ].filter((part) => part !== undefined);
  cursor.text(people.join(' · '), { size: 10, muted: true });
  cursor.gap(12);

  const items = characteristics(appraisal);
  if (items.length > 0) {
    cursor.text('La propiedad', { size: 12, bold: true });
    twoColumns(cursor, items);
    cursor.gap(12);
  }
}

function values(cursor: Cursor, appraisal: AppraisalDetail) {
  const { sale, rent } = appraisal.result;
  cursor.text('Valor sugerido', { size: 12, bold: true });
  cursor.gap(2);
  if (sale !== undefined) cursor.text(`Venta: ${range(sale)}`, { size: 14, bold: true });
  if (rent !== undefined) {
    cursor.text(`Alquiler mensual: ${range(rent)}`, { size: 14, bold: true });
  }
  cursor.gap(12);
}

/** Escribe las celdas de una fila una al lado de la otra; la fila mide lo que la más alta. */
function row(
  cursor: Cursor,
  cells: readonly string[],
  options: { readonly bold?: boolean; readonly muted?: boolean },
) {
  cursor.ensure(30);
  const top = cursor.y;
  let bottom = top;
  let x = PAGE.margin;
  COLUMNS.forEach((column, index) => {
    cursor.y = top;
    cursor.text(cells[index] ?? '', { size: 9, x, width: column.width - 8, ...options });
    bottom = Math.min(bottom, cursor.y);
    x += column.width;
  });
  cursor.y = bottom;
}

function comparables(cursor: Cursor, items: readonly AppraisalComparableRow[]) {
  if (items.length === 0) return;
  cursor.text('Comparables', { size: 12, bold: true });
  cursor.text('Propiedades parecidas de la zona que respaldan el valor sugerido.', {
    size: 9,
    muted: true,
  });
  cursor.gap(4);
  row(
    cursor,
    COLUMNS.map((column) => column.title),
    { bold: true },
  );
  cursor.rule();
  for (const comparable of items) {
    row(
      cursor,
      [
        comparable.address,
        money(comparable.price.currency, comparable.price.amountCents),
        comparable.surfaceM2 === undefined
          ? '-'
          : `${numberFormat.format(comparable.surfaceM2)} m2`,
        comparable.pricePerM2 === undefined
          ? '-'
          : money(comparable.pricePerM2.currency, comparable.pricePerM2.amountCents),
      ],
      {},
    );
    if (comparable.note !== undefined) {
      cursor.text(comparable.note, { size: 8, muted: true, width: COLUMNS[0].width - 8 });
    }
    cursor.gap(4);
  }
  cursor.gap(8);
}

function observations(cursor: Cursor, text: string | undefined) {
  if (text === undefined || text.trim() === '') return;
  cursor.text('Observaciones', { size: 12, bold: true });
  cursor.text(text, { size: 10 });
  cursor.gap(12);
}

/** Las fotos de a dos por fila. Se achican y se embeben de a una para no cargarlas todas juntas. */
async function photos(cursor: Cursor, doc: PDFDocument, source: AsyncIterable<Uint8Array>) {
  const width = (CONTENT_WIDTH - PHOTO_GAP) / 2;
  const height = width * 0.75;
  let pending: PDFImage | undefined;
  let titled = false;

  const drawRow = (images: readonly PDFImage[]) => {
    if (!titled) {
      cursor.ensure(height + 24);
      cursor.text('Fotos', { size: 12, bold: true });
      cursor.gap(4);
      titled = true;
    }
    cursor.ensure(height);
    const top = cursor.y;
    let tallest = 0;
    images.forEach((image, column) => {
      cursor.y = top;
      tallest = Math.max(
        tallest,
        cursor.image(image, { x: PAGE.margin + column * (width + PHOTO_GAP), width, height }),
      );
    });
    cursor.y = top - tallest - PHOTO_GAP;
  };

  for await (const bytes of source) {
    const jpeg = await printablePhoto(bytes);
    if (jpeg === undefined) continue;
    const image = await doc.embedJpg(jpeg);
    if (pending === undefined) {
      pending = image;
    } else {
      drawRow([pending, image]);
      pending = undefined;
    }
  }
  if (pending !== undefined) drawRow([pending]);
}

function footer(cursor: Cursor, content: AppraisalReportContent) {
  cursor.gap(8);
  cursor.rule();
  cursor.text(
    `${content.company.name} · Valores orientativos, sujetos a las condiciones del mercado · Generado el ${dateFormat.format(content.generatedAt)}`,
    { size: 8, muted: true },
  );
}

export class PdfLibAppraisalReportRenderer implements AppraisalReportRenderer {
  async render(content: AppraisalReportContent): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.setTitle(printable(`Tasación ${content.appraisal.code}`));
    doc.setAuthor(printable(content.company.name));
    doc.setCreationDate(content.generatedAt);
    const cursor = new Cursor(doc, {
      regular: await doc.embedFont(StandardFonts.Helvetica),
      bold: await doc.embedFont(StandardFonts.HelveticaBold),
    });
    await header(cursor, doc, content);
    summary(cursor, content);
    values(cursor, content.appraisal);
    comparables(cursor, content.appraisal.result.comparables);
    observations(cursor, content.appraisal.result.observations);
    await photos(cursor, doc, content.photos);
    footer(cursor, content);
    return doc.save();
  }
}
