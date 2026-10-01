import {
  OPERATION_LABELS,
  PROPERTY_KIND_LABELS,
  PROPERTY_KINDS,
  type PdfPrice,
  type PropertyDocumentContent,
  type PropertyDocumentRenderer,
} from '@norde/core/properties';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';

// Los PDF de la ficha con pdf-lib, en español: la ficha (varias fotos y todos los datos), la hoja de
// vidriera (una foto grande y lo esencial) y el reporte al propietario.

const PAGE = { width: 595.28, height: 841.89, margin: 40 } as const;
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;
const TIME_ZONE = 'America/Argentina/Buenos_Aires';
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.4, 0.4, 0.4);
const RULE = rgb(0.85, 0.85, 0.85);

const dateFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const numberFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

const STATUS_LABELS: Readonly<Record<string, string>> = {
  draft: 'Borrador',
  available: 'Disponible',
  reserved: 'Reservada',
  sold: 'Vendida',
  rented: 'Alquilada',
  paused: 'Suspendida',
  withdrawn: 'Dada de baja',
};
const ORIENTATION_LABELS: Readonly<Record<string, string>> = {
  north: 'Norte',
  south: 'Sur',
  east: 'Este',
  west: 'Oeste',
  northeast: 'Noreste',
  northwest: 'Noroeste',
  southeast: 'Sudeste',
  southwest: 'Sudoeste',
};
const CONDITION_LABELS: Readonly<Record<string, string>> = {
  brand_new: 'A estrenar',
  excellent: 'Excelente',
  very_good: 'Muy bueno',
  good: 'Bueno',
  fair: 'Regular',
  to_renovate: 'A reciclar',
};
const DISPOSITION_LABELS: Readonly<Record<string, string>> = {
  front: 'Frente',
  back: 'Contrafrente',
  internal: 'Interno',
  lateral: 'Lateral',
};
const FEATURE_KIND_LABELS: Readonly<Record<string, string>> = {
  service: 'Servicios',
  room: 'Ambientes',
  amenity: 'Adicionales',
};
const PORTAL_STATUS_LABELS: Readonly<Record<string, string>> = {
  pending: 'Pendiente',
  published: 'Publicada',
  paused: 'Pausada',
  error: 'Con error',
  unpublished: 'Despublicada',
};

/** Las fuentes estándar del PDF solo tienen Latin-1: lo demás se reemplaza. */
function printable(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00B2/g, '2')
    .replace(/[^\u0020-\u007E\u00A0-\u00FF\n]/g, '');
}

/** Centavos → "USD 120.000" (exacto: sin pasar los centavos por `number` hasta el final). */
function money(currency: string, cents: bigint): string {
  const units = Number(cents / 100n) + Number(cents % 100n) / 100;
  return `${currency} ${numberFormat.format(units)}`;
}

function kindLabel(kind: string): string {
  const known = PROPERTY_KINDS.find((candidate) => candidate === kind);
  return known === undefined ? kind : PROPERTY_KIND_LABELS[known];
}

function priceLine(price: PdfPrice): string {
  const amount =
    price.priceCents === undefined ? 'Consultar precio' : money(price.currency, price.priceCents);
  const operation = OPERATION_LABELS[price.operation].replace(/^en /, '');
  return `${operation.charAt(0).toUpperCase()}${operation.slice(1)}: ${amount}`;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8;
}

function isPng(bytes: Uint8Array): boolean {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

async function embed(doc: PDFDocument, bytes: Uint8Array): Promise<PDFImage | undefined> {
  if (isJpeg(bytes)) return doc.embedJpg(bytes);
  if (isPng(bytes)) return doc.embedPng(bytes);
  // WebP y otros formatos no los soporta pdf-lib: la foto se omite.
  return undefined;
}

interface Fonts {
  readonly regular: PDFFont;
  readonly bold: PDFFont;
}

/** Escribe de arriba hacia abajo, con salto de página y párrafos que se cortan por palabra. */
class Cursor {
  page: PDFPage;
  y: number;

  constructor(
    private readonly doc: PDFDocument,
    readonly fonts: Fonts,
  ) {
    this.page = doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
  }

  ensure(height: number): void {
    if (this.y - height >= PAGE.margin) return;
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
  }

  text(
    value: string,
    options: {
      readonly size: number;
      readonly bold?: boolean;
      readonly muted?: boolean;
      readonly x?: number;
      readonly width?: number;
    },
  ): void {
    const font = options.bold ? this.fonts.bold : this.fonts.regular;
    const width = options.width ?? CONTENT_WIDTH;
    for (const line of this.wrap(printable(value), font, options.size, width)) {
      this.ensure(options.size + 4);
      this.y -= options.size + 4;
      this.page.drawText(line, {
        x: options.x ?? PAGE.margin,
        y: this.y,
        size: options.size,
        font,
        color: options.muted ? MUTED : INK,
      });
    }
  }

  rule(): void {
    this.ensure(10);
    this.y -= 6;
    this.page.drawLine({
      start: { x: PAGE.margin, y: this.y },
      end: { x: PAGE.width - PAGE.margin, y: this.y },
      thickness: 0.5,
      color: RULE,
    });
    this.y -= 6;
  }

  gap(height: number): void {
    this.y -= height;
  }

  /** Dibuja la imagen escalada para entrar en el recuadro, sin deformarla. */
  image(
    image: PDFImage,
    box: { readonly x: number; readonly width: number; readonly height: number },
  ) {
    const scale = Math.min(box.width / image.width, box.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    this.ensure(height);
    this.page.drawImage(image, {
      x: box.x + (box.width - width) / 2,
      y: this.y - height,
      width,
      height,
    });
    return height;
  }

  private wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      let current = '';
      for (const word of paragraph.split(/\s+/).filter((part) => part !== '')) {
        const candidate = current === '' ? word : `${current} ${word}`;
        if (font.widthOfTextAtSize(candidate, size) <= width || current === '') {
          current = candidate;
        } else {
          lines.push(current);
          current = word;
        }
      }
      lines.push(current);
    }
    return lines;
  }
}

async function header(cursor: Cursor, doc: PDFDocument, content: PropertyDocumentContent) {
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
  const code = printable(`Código ${content.property.code}`);
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

function footer(cursor: Cursor, content: PropertyDocumentContent) {
  cursor.gap(8);
  cursor.rule();
  const parts = [
    content.company.name,
    content.agentName === undefined ? undefined : `Atiende: ${content.agentName}`,
    `Generado el ${dateFormat.format(content.generatedAt)}`,
  ].filter((part) => part !== undefined);
  cursor.text(parts.join(' · '), { size: 8, muted: true });
}

function characteristics(content: PropertyDocumentContent): string[] {
  const c = content.property.characteristics;
  const deal = content.property.deal;
  return [
    c.rooms === undefined ? undefined : `${c.rooms.toString()} ambientes`,
    c.bedrooms === undefined ? undefined : `${c.bedrooms.toString()} dormitorios`,
    c.bathrooms === undefined ? undefined : `${c.bathrooms.toString()} baños`,
    c.toilets === undefined ? undefined : `${c.toilets.toString()} toilettes`,
    c.parkingSpaces === undefined ? undefined : `${c.parkingSpaces.toString()} cocheras`,
    c.surfaceTotalM2 === undefined
      ? undefined
      : `${numberFormat.format(c.surfaceTotalM2)} m2 totales`,
    c.surfaceCoveredM2 === undefined
      ? undefined
      : `${numberFormat.format(c.surfaceCoveredM2)} m2 cubiertos`,
    c.surfaceSemiCoveredM2 === undefined
      ? undefined
      : `${numberFormat.format(c.surfaceSemiCoveredM2)} m2 semicubiertos`,
    c.surfaceLandM2 === undefined
      ? undefined
      : `${numberFormat.format(c.surfaceLandM2)} m2 de terreno`,
    c.frontM === undefined || c.depthM === undefined
      ? undefined
      : `Lote de ${numberFormat.format(c.frontM)} x ${numberFormat.format(c.depthM)} m`,
    c.ageYears === undefined
      ? undefined
      : c.ageYears === 0
        ? 'A estrenar'
        : `${c.ageYears.toString()} años`,
    c.orientation === undefined
      ? undefined
      : `Orientación ${ORIENTATION_LABELS[c.orientation] ?? ''}`,
    c.disposition === undefined ? undefined : DISPOSITION_LABELS[c.disposition],
    c.condition === undefined ? undefined : `Estado: ${CONDITION_LABELS[c.condition] ?? ''}`,
    c.isFurnished ? 'Amoblado' : undefined,
    c.professionalUse ? 'Apto profesional' : undefined,
    deal.creditEligible ? 'Apto crédito' : undefined,
    deal.acceptsSwap ? 'Acepta permuta' : undefined,
    deal.hasFinancing ? 'Con financiación' : undefined,
    deal.expensesCents === undefined ? undefined : `Expensas ${money('ARS', deal.expensesCents)}`,
  ].filter((part): part is string => part !== undefined);
}

/** Lista en dos columnas. */
function twoColumns(cursor: Cursor, items: readonly string[]) {
  const half = Math.ceil(items.length / 2);
  const column = CONTENT_WIDTH / 2;
  for (let index = 0; index < half; index += 1) {
    const left = items[index];
    const right = items[index + half];
    const y = cursor.y;
    if (left !== undefined) cursor.text(`• ${left}`, { size: 10, width: column - 8 });
    const afterLeft = cursor.y;
    if (right !== undefined) {
      cursor.y = y;
      cursor.text(`• ${right}`, { size: 10, x: PAGE.margin + column, width: column - 8 });
    }
    cursor.y = Math.min(afterLeft, cursor.y);
  }
}

async function sheet(doc: PDFDocument, cursor: Cursor, content: PropertyDocumentContent) {
  const { property } = content;
  cursor.text(property.portalTitle, { size: 18, bold: true });
  cursor.text(`${kindLabel(property.propertyType)} · ${content.address}`, {
    size: 10,
    muted: true,
  });
  cursor.gap(4);
  for (const price of content.prices) cursor.text(priceLine(price), { size: 13, bold: true });
  cursor.gap(8);

  const images = (await Promise.all(content.photos.map((photo) => embed(doc, photo)))).filter(
    (image) => image !== undefined,
  );
  const [main, ...rest] = images;
  if (main) {
    cursor.y -= cursor.image(main, { x: PAGE.margin, width: CONTENT_WIDTH, height: 300 }) + 8;
  }
  // Miniaturas de a cuatro por fila.
  const thumb = (CONTENT_WIDTH - 3 * 8) / 4;
  for (let row = 0; row < rest.length; row += 4) {
    cursor.ensure(thumb * 0.75);
    const top = cursor.y;
    let tallest = 0;
    rest.slice(row, row + 4).forEach((image, column) => {
      cursor.y = top;
      tallest = Math.max(
        tallest,
        cursor.image(image, {
          x: PAGE.margin + column * (thumb + 8),
          width: thumb,
          height: thumb * 0.75,
        }),
      );
    });
    cursor.y = top - tallest - 8;
  }

  const items = characteristics(content);
  if (items.length > 0) {
    cursor.text('Características', { size: 12, bold: true });
    twoColumns(cursor, items);
    cursor.gap(6);
  }
  const groups = new Map<string, string[]>();
  for (const feature of property.features) {
    groups.set(feature.kind, [...(groups.get(feature.kind) ?? []), feature.name]);
  }
  for (const [kind, names] of groups) {
    cursor.text(FEATURE_KIND_LABELS[kind] ?? kind, { size: 12, bold: true });
    cursor.text(names.join(' · '), { size: 10 });
    cursor.gap(6);
  }
  if (property.description.trim() !== '') {
    cursor.text('Descripción', { size: 12, bold: true });
    cursor.text(property.description, { size: 10 });
  }
}

async function showcase(doc: PDFDocument, cursor: Cursor, content: PropertyDocumentContent) {
  const { property } = content;
  const [photo] = content.photos;
  const image = photo === undefined ? undefined : await embed(doc, photo);
  if (image) {
    cursor.y -= cursor.image(image, { x: PAGE.margin, width: CONTENT_WIDTH, height: 420 }) + 16;
  }
  cursor.text(property.portalTitle, { size: 24, bold: true });
  cursor.text(`${kindLabel(property.propertyType)} · ${content.address}`, {
    size: 12,
    muted: true,
  });
  cursor.gap(8);
  for (const price of content.prices) cursor.text(priceLine(price), { size: 20, bold: true });
  cursor.gap(8);
  cursor.text(characteristics(content).slice(0, 8).join(' · '), { size: 12 });
}

function ownerReport(cursor: Cursor, content: PropertyDocumentContent) {
  const { property } = content;
  const report = content.ownerReport;
  cursor.text('Reporte de actividad', { size: 18, bold: true });
  cursor.text(`${property.portalTitle} · ${content.address}`, { size: 10, muted: true });
  if (report === undefined) return;
  const from = report.from.split('-').reverse().join('/');
  const to = report.to.split('-').reverse().join('/');
  cursor.text(`Período: del ${from} al ${to}`, { size: 10, muted: true });
  cursor.text(`Estado: ${STATUS_LABELS[property.status] ?? property.status}`, {
    size: 10,
    muted: true,
  });
  cursor.gap(10);

  cursor.text('Resumen', { size: 12, bold: true });
  twoColumns(cursor, [
    `${report.inquiries.toString()} consultas recibidas`,
    `${report.interested.toString()} clientes con búsquedas que coinciden`,
    `${report.emailSends.toString()} envíos por email`,
    `${report.whatsappSends.toString()} envíos por WhatsApp`,
  ]);
  cursor.gap(10);

  cursor.text('Publicaciones', { size: 12, bold: true });
  if (report.publications.length === 0) {
    cursor.text('No está publicada en portales en este período.', { size: 10, muted: true });
    return;
  }
  for (const publication of report.publications) {
    const status = PORTAL_STATUS_LABELS[publication.status] ?? publication.status;
    cursor.text(
      `${publication.portal}: ${status} · ${publication.views.toString()} visitas · ${publication.contacts.toString()} contactos · ${publication.favorites.toString()} favoritos`,
      { size: 10 },
    );
  }
}

export class PdfLibPropertyDocumentRenderer implements PropertyDocumentRenderer {
  async render(content: PropertyDocumentContent): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const titles = { sheet: 'Ficha', showcase: 'Vidriera', owner_report: 'Reporte al propietario' };
    doc.setTitle(printable(`${titles[content.kind]} ${content.property.code}`));
    doc.setAuthor(printable(content.company.name));
    doc.setCreationDate(content.generatedAt);
    const fonts = {
      regular: await doc.embedFont(StandardFonts.Helvetica),
      bold: await doc.embedFont(StandardFonts.HelveticaBold),
    };
    const cursor = new Cursor(doc, fonts);
    await header(cursor, doc, content);
    if (content.kind === 'sheet') await sheet(doc, cursor, content);
    else if (content.kind === 'showcase') await showcase(doc, cursor, content);
    else ownerReport(cursor, content);
    footer(cursor, content);
    return doc.save();
  }
}
