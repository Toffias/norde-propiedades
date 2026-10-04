import {
  OPERATION_LABELS,
  PROPERTY_KIND_LABELS,
  PROPERTY_KINDS,
  type PdfPrice,
  type PropertyDocumentContent,
  type PropertyDocumentRenderer,
} from '@norde/core/properties';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import {
  CONDITION_LABELS,
  CONTENT_WIDTH,
  Cursor,
  dateFormat,
  embed,
  money,
  MUTED,
  numberFormat,
  PAGE,
  printable,
  twoColumns,
} from './pdf-kit';

// Los PDF de la ficha con pdf-lib, en español: la ficha (varias fotos y todos los datos), la hoja de
// vidriera (una foto grande y lo esencial) y el reporte al propietario.

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
