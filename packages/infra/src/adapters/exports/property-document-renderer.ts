import {
  OPERATION_LABELS,
  PROPERTY_KIND_LABELS,
  PROPERTY_KINDS,
  type PdfPrice,
  type PropertyDocumentContent,
  type PropertyDocumentRenderer,
} from '@norde/core/properties';
import { PDFDocument } from 'pdf-lib';

import {
  BRAND,
  chips,
  CONDITION_LABELS,
  contactCard,
  contactParts,
  CONTENT_BOTTOM,
  CONTENT_TOP,
  CONTENT_WIDTH,
  Cursor,
  dateFormat,
  displayPhone,
  drawChrome,
  drawText,
  embedFonts,
  embedPhoto,
  fitSize,
  INK,
  isoDay,
  MUTED,
  numberFormat,
  PAGE,
  printable,
  roundedRect,
  roundMoney,
  RULE,
  squareMeters,
  table,
  textHeight,
  type Fact,
  type Fonts,
} from './pdf-kit';

// Los PDF de la ficha con pdf-lib, en español: la hoja de vidriera (un afiche de una hoja que se lee
// de lejos) y el reporte al propietario (publicaciones, movimiento del período mes a mes y
// contacto). La ficha pasó a react-pdf (`pdf/property-sheet-renderer.tsx`, #175).

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
const PORTAL_STATUS_LABELS: Readonly<Record<string, string>> = {
  pending: 'Pendiente',
  published: 'Publicada',
  paused: 'Pausada',
  error: 'Con error',
  unpublished: 'Despublicada',
};
const PORTAL_LABELS: Readonly<Record<string, string>> = {
  mercadolibre: 'MercadoLibre',
  mercadolibre_developments: 'MercadoLibre',
  zonaprop: 'Zonaprop',
  argenprop: 'Argenprop',
};
const MONTH_LABELS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];
const TITLES = {
  sheet: 'Ficha de la propiedad',
  showcase: 'Propiedad en vidriera',
  owner_report: 'Reporte al propietario',
} as const;
const FILE_TITLES = {
  sheet: 'Ficha',
  showcase: 'Vidriera',
  owner_report: 'Reporte al propietario',
};

type Content = PropertyDocumentContent;

function kindLabel(kind: string): string {
  const known = PROPERTY_KINDS.find((candidate) => candidate === kind);
  return known === undefined ? kind : PROPERTY_KIND_LABELS[known];
}

/** "Venta", "Alquiler", "Alquiler temporario". */
function operationLabel(price: PdfPrice): string {
  const operation = OPERATION_LABELS[price.operation].replace(/^en /, '');
  return `${operation.charAt(0).toUpperCase()}${operation.slice(1)}`;
}

function amount(price: PdfPrice): string {
  return price.priceCents === undefined
    ? 'Consultar precio'
    : roundMoney(price.currency, price.priceCents);
}

/** "Departamento en venta y alquiler". */
function headline(content: Content): string {
  const operations = content.prices.map((price) => operationLabel(price).toLowerCase());
  const joined =
    operations.length <= 1
      ? operations.join('')
      : `${operations.slice(0, -1).join(', ')} y ${operations.at(-1) ?? ''}`;
  return [kindLabel(content.property.propertyType), joined === '' ? '' : `en ${joined}`]
    .filter((part) => part !== '')
    .join(' ');
}

function plural(value: number, one: string, many: string): string {
  return value === 1 ? one : many;
}

/** Los datos principales, en el orden en que se leen. Sin dato, no aparece. */
function keyFacts(content: Content): Fact[] {
  const c = content.property.characteristics;
  const facts: (Fact | undefined)[] = [
    c.rooms === undefined ? undefined : { label: 'Ambientes', value: c.rooms.toString() },
    c.bedrooms === undefined ? undefined : { label: 'Dormitorios', value: c.bedrooms.toString() },
    c.bathrooms === undefined ? undefined : { label: 'Baños', value: c.bathrooms.toString() },
    c.toilets === undefined ? undefined : { label: 'Toilettes', value: c.toilets.toString() },
    c.parkingSpaces === undefined
      ? undefined
      : { label: 'Cocheras', value: c.parkingSpaces.toString() },
    c.surfaceTotalM2 === undefined
      ? undefined
      : { label: 'Sup. total', value: squareMeters(c.surfaceTotalM2) },
    c.surfaceCoveredM2 === undefined
      ? undefined
      : { label: 'Sup. cubierta', value: squareMeters(c.surfaceCoveredM2) },
    c.surfaceSemiCoveredM2 === undefined
      ? undefined
      : { label: 'Sup. semicubierta', value: squareMeters(c.surfaceSemiCoveredM2) },
    c.surfaceLandM2 === undefined
      ? undefined
      : { label: 'Terreno', value: squareMeters(c.surfaceLandM2) },
    c.frontM === undefined || c.depthM === undefined
      ? undefined
      : {
          label: 'Lote',
          value: `${numberFormat.format(c.frontM)} x ${numberFormat.format(c.depthM)} m`,
        },
    c.ageYears === undefined
      ? undefined
      : {
          label: 'Antigüedad',
          value:
            c.ageYears === 0
              ? 'A estrenar'
              : `${c.ageYears.toString()} ${plural(c.ageYears, 'año', 'años')}`,
        },
    content.property.deal.expensesCents === undefined
      ? undefined
      : { label: 'Expensas', value: roundMoney('ARS', content.property.deal.expensesCents) },
    c.orientation === undefined
      ? undefined
      : { label: 'Orientación', value: ORIENTATION_LABELS[c.orientation] ?? c.orientation },
    c.disposition === undefined
      ? undefined
      : { label: 'Disposición', value: DISPOSITION_LABELS[c.disposition] ?? c.disposition },
    c.condition === undefined
      ? undefined
      : { label: 'Estado', value: CONDITION_LABELS[c.condition] ?? c.condition },
  ];
  return facts.filter((fact): fact is Fact => fact !== undefined);
}

/** Los cinco datos que más se miran en una vidriera, en este orden. */
const POSTER_FACTS = [
  'Sup. total',
  'Ambientes',
  'Dormitorios',
  'Baños',
  'Cocheras',
  'Terreno',
  'Sup. cubierta',
  'Antigüedad',
];

function posterFacts(content: Content): Fact[] {
  const facts = keyFacts(content);
  return POSTER_FACTS.flatMap((label) => facts.filter((fact) => fact.label === label)).slice(0, 5);
}

/** Lo que suma a la operación: crédito, permuta, financiación. */
function highlights(content: Content): string[] {
  const { characteristics: c, deal } = content.property;
  return [
    deal.creditEligible ? 'Apto crédito' : undefined,
    deal.acceptsSwap ? 'Acepta permuta' : undefined,
    deal.hasFinancing ? 'Con financiación' : undefined,
    deal.immediateDeed ? 'Escritura inmediata' : undefined,
    c.isFurnished ? 'Amoblado' : undefined,
    c.professionalUse ? 'Apto profesional' : undefined,
  ].filter((part): part is string => part !== undefined);
}

/** El precio por m² de una operación, solo si el precio se muestra. */
function pricePerM2(content: Content, price: PdfPrice): string | undefined {
  if (price.priceCents === undefined) return undefined;
  const operation = content.property.operations.find(
    (candidate) => candidate.operation === price.operation && candidate.currency === price.currency,
  );
  const perM2 = operation?.pricePerM2Cents;
  return perM2 === undefined ? undefined : `${roundMoney(price.currency, perM2)} / m²`;
}

async function photos(doc: PDFDocument, content: Content, box: { width: number; height: number }) {
  const [first] = content.photos;
  return first === undefined ? undefined : embedPhoto(doc, first, box);
}

/** Encabezado del contenido: una línea de acento, el título y la dirección. */
function titleBlock(cursor: Cursor, eyebrow: string, title: string, subtitle: string, size = 21) {
  cursor.text(eyebrow.toUpperCase(), { size: 8.5, font: cursor.fonts.bold, color: BRAND.accent });
  cursor.gap(3);
  cursor.text(title, { size, font: cursor.fonts.bold, color: INK, leading: 1.15, maxLines: 2 });
  if (subtitle !== '') {
    cursor.gap(2);
    cursor.text(subtitle, { size: 10.5, color: MUTED });
  }
  cursor.gap(12);
}

// ---------- Vidriera ----------

/** Un afiche de una sola hoja: todo se acomoda al espacio que hay, nada salta de hoja. */
async function showcase(doc: PDFDocument, cursor: Cursor, content: Content) {
  const { property } = content;
  const { page, fonts } = cursor;
  const x = PAGE.margin;
  let y = CONTENT_TOP + 4;

  // Lo de abajo hacia arriba: contacto, datos y precio; la foto toma lo que queda.
  const contactHeight = 84;
  const contactTop = CONTENT_BOTTOM + contactHeight;
  const facts = posterFacts(content);
  const extras = highlights(content).slice(0, 5);
  const factsHeight = facts.length > 0 ? 66 : 0;
  const chipsHeight = extras.length > 0 ? 30 : 0;
  const priceHeight = content.prices.length > 0 ? 78 : 0;

  // Título.
  y -= drawText(page, fonts, headline(content).toUpperCase(), y, {
    size: 11,
    font: fonts.bold,
    color: BRAND.accent,
  });
  y -= 4;
  y -= drawText(page, fonts, property.portalTitle, y, {
    size: 26,
    font: fonts.bold,
    leading: 1.12,
    maxLines: 2,
  });
  y -= 2;
  if (content.address !== '') {
    y -= drawText(page, fonts, content.address, y, { size: 12.5, color: MUTED, maxLines: 1 });
  }
  y -= 12;

  // Fotos.
  const below = priceHeight + factsHeight + chipsHeight + 12;
  const photoSpace = y - contactTop - 14 - below;
  const thumbs = content.photos.slice(1, 3);
  const thumbHeight = thumbs.length === 2 ? Math.min(118, photoSpace * 0.3) : 0;
  const heroHeight = photoSpace - (thumbHeight > 0 ? thumbHeight + 8 : 0);
  const hero = await photos(doc, content, { width: CONTENT_WIDTH, height: heroHeight });
  if (hero) {
    page.drawImage(hero, { x, y: y - heroHeight, width: CONTENT_WIDTH, height: heroHeight });
    if (thumbHeight > 0) {
      const width = (CONTENT_WIDTH - 8) / 2;
      const images = await Promise.all(
        thumbs.map((bytes) => embedPhoto(doc, bytes, { width, height: thumbHeight })),
      );
      images.forEach((image, column) => {
        if (image === undefined) return;
        page.drawImage(image, {
          x: x + column * (width + 8),
          y: y - heroHeight - 8 - thumbHeight,
          width,
          height: thumbHeight,
        });
      });
    }
    y -= photoSpace + 12;
  } else {
    // Sin foto: un recuadro con la marca, para que el afiche no quede vacío.
    roundedRect(
      page,
      { x, y: y - photoSpace, width: CONTENT_WIDTH, height: photoSpace },
      { color: BRAND.sand, radius: 8 },
    );
    drawText(page, fonts, content.company.name, y - photoSpace / 2 + 12, {
      size: 24,
      font: fonts.bold,
      color: BRAND.sandDark,
      align: 'center',
    });
    y -= photoSpace + 12;
  }

  // Precio.
  if (priceHeight > 0) {
    const height = priceHeight - 12;
    roundedRect(
      page,
      { x, y: y - height, width: CONTENT_WIDTH, height },
      { color: BRAND.dark, radius: 8 },
    );
    const slots = content.prices.slice(0, 2);
    const width = CONTENT_WIDTH / slots.length;
    slots.forEach((price, index) => {
      const left = x + index * width + 20;
      drawText(page, fonts, operationLabel(price).toUpperCase(), y - 12, {
        size: 9,
        font: fonts.bold,
        color: BRAND.cream,
        x: left,
        width: width - 40,
      });
      drawText(page, fonts, amount(price), y - 25, {
        size: fitSize(fonts.bold, amount(price), slots.length === 1 ? 30 : 24, width - 40, 14),
        font: fonts.bold,
        color: BRAND.white,
        x: left,
        width: width - 40,
        maxLines: 1,
      });
    });
    if (slots.length === 1 && slots[0] !== undefined) {
      const perM2 = pricePerM2(content, slots[0]);
      if (perM2 !== undefined) {
        drawText(page, fonts, perM2, y - 30, {
          size: 11,
          color: BRAND.cream,
          x,
          width: CONTENT_WIDTH - 20,
          align: 'right',
        });
      }
    }
    y -= priceHeight;
  }

  // Datos grandes.
  if (factsHeight > 0) {
    const gap = 8;
    const width = (CONTENT_WIDTH - gap * (facts.length - 1)) / facts.length;
    const height = factsHeight - 10;
    facts.forEach((fact, index) => {
      const left = x + index * (width + gap);
      roundedRect(page, { x: left, y: y - height, width, height }, { color: BRAND.sand });
      drawText(page, fonts, fact.value, y - 10, {
        size: fact.value.length > 7 ? 15 : 22,
        font: fonts.bold,
        x: left + 6,
        width: width - 12,
        align: 'center',
        maxLines: 1,
      });
      drawText(page, fonts, fact.label.toUpperCase(), y - height + 16, {
        size: 7.5,
        font: fonts.bold,
        color: MUTED,
        x: left + 6,
        width: width - 12,
        align: 'center',
        maxLines: 1,
      });
    });
    y -= factsHeight;
  }

  if (chipsHeight > 0) {
    cursor.y = y;
    chips(cursor, extras, { size: 10 });
  }

  // Contacto, en la franja de acento.
  const top = contactTop;
  roundedRect(
    page,
    { x, y: top - contactHeight, width: CONTENT_WIDTH, height: contactHeight },
    { color: BRAND.accent, radius: 8 },
  );
  const contact = content.branch;
  const whatsapp = contact?.whatsapp ?? content.agent?.phone;
  drawText(page, fonts, 'CONSULTÁ POR ESTA PROPIEDAD', top - 14, {
    size: 8.5,
    font: fonts.bold,
    color: BRAND.white,
    x: x + 20,
    width: 300,
  });
  drawText(
    page,
    fonts,
    whatsapp === undefined
      ? content.company.name
      : `${contact?.whatsapp === undefined ? 'Tel.' : 'WhatsApp'} ${displayPhone(whatsapp)}`,
    top - 28,
    { size: 20, font: fonts.bold, color: BRAND.white, x: x + 20, width: 320, maxLines: 1 },
  );
  const secondary = [
    contact?.address,
    contact?.phone === undefined ? undefined : `Tel. ${displayPhone(contact.phone)}`,
    contact?.email,
  ].filter((part): part is string => part !== undefined);
  if (secondary.length > 0) {
    drawText(page, fonts, secondary.join('  ·  '), top - 54, {
      size: 8.5,
      color: BRAND.white,
      x: x + 20,
      width: CONTENT_WIDTH - 40,
      maxLines: 1,
    });
  }
  if (content.webUrl !== undefined) {
    drawText(page, fonts, content.webUrl, top - 67, {
      size: 8.5,
      font: fonts.bold,
      color: BRAND.white,
      x: x + 20,
      width: CONTENT_WIDTH - 40,
      maxLines: 1,
    });
  }
  drawText(page, fonts, 'CÓDIGO', top - 16, {
    size: 7.5,
    font: fonts.bold,
    color: BRAND.white,
    x: x + CONTENT_WIDTH - 130,
    width: 110,
    align: 'right',
  });
  drawText(page, fonts, property.code, top - 27, {
    size: 16,
    font: fonts.bold,
    color: BRAND.white,
    x: x + CONTENT_WIDTH - 130,
    width: 110,
    align: 'right',
  });
}

// ---------- Reporte al propietario ----------

/** "2026-09" → "sep 26". */
function monthLabel(month: string): string {
  const [year = '', value = '1'] = month.split('-');
  return `${MONTH_LABELS[Number(value) - 1] ?? value} ${year.slice(2)}`;
}

function kpiTiles(cursor: Cursor, tiles: readonly Fact[]) {
  const columns = 3;
  const gap = 10;
  const width = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
  const height = 58;
  for (let start = 0; start < tiles.length; start += columns) {
    cursor.ensure(height);
    const top = cursor.y;
    tiles.slice(start, start + columns).forEach((tile, column) => {
      const left = PAGE.margin + column * (width + gap);
      roundedRect(cursor.page, { x: left, y: top - height, width, height }, { color: BRAND.sand });
      cursor.page.drawRectangle({
        x: left,
        y: top - height,
        width: 3,
        height,
        color: BRAND.accent,
      });
      drawText(cursor.page, cursor.fonts, tile.value, top - 10, {
        size: 22,
        font: cursor.fonts.bold,
        x: left + 14,
        width: width - 24,
      });
      drawText(cursor.page, cursor.fonts, tile.label, top - 38, {
        size: 8.5,
        color: MUTED,
        x: left + 14,
        width: width - 24,
        maxLines: 1,
      });
    });
    cursor.y = top - height - gap;
  }
}

const SERIES = [
  { key: 'inquiries', label: 'Consultas', color: BRAND.accent },
  { key: 'emailSends', label: 'Envíos por email', color: BRAND.dark },
  { key: 'whatsappSends', label: 'Envíos por WhatsApp', color: BRAND.sandDark },
] as const;

/** Barras agrupadas por mes: consultas, envíos por email y por WhatsApp. */
function activityChart(cursor: Cursor, monthly: NonNullable<Content['ownerReport']>['monthly']) {
  const max = Math.max(0, ...monthly.flatMap((row) => SERIES.map((series) => row[series.key])));
  if (max === 0) {
    cursor.text('No hubo consultas ni envíos en el período.', { size: 9.5, color: MUTED });
    cursor.gap(6);
    return;
  }
  const chartHeight = 120;
  const legendHeight = 18;
  const labelsHeight = 16;
  cursor.ensure(chartHeight + legendHeight + labelsHeight + 8);
  const { page, fonts } = cursor;
  let x = PAGE.margin;
  for (const series of SERIES) {
    page.drawRectangle({ x, y: cursor.y - 8, width: 8, height: 8, color: series.color });
    const label = printable(series.label);
    page.drawText(label, {
      x: x + 12,
      y: cursor.y - 7.5,
      size: 8,
      font: fonts.regular,
      color: MUTED,
    });
    x += fonts.regular.widthOfTextAtSize(label, 8) + 28;
  }
  const base = cursor.y - legendHeight - chartHeight;
  // Líneas guía.
  for (const fraction of [0.5, 1]) {
    page.drawLine({
      start: { x: PAGE.margin, y: base + chartHeight * fraction },
      end: { x: PAGE.width - PAGE.margin, y: base + chartHeight * fraction },
      thickness: 0.4,
      color: RULE,
      dashArray: [2, 2],
    });
  }
  page.drawLine({
    start: { x: PAGE.margin, y: base },
    end: { x: PAGE.width - PAGE.margin, y: base },
    thickness: 0.8,
    color: MUTED,
  });
  const slot = CONTENT_WIDTH / monthly.length;
  const barWidth = Math.min(14, (slot - 8) / SERIES.length);
  monthly.forEach((row, index) => {
    const groupWidth = barWidth * SERIES.length;
    const left = PAGE.margin + index * slot + (slot - groupWidth) / 2;
    SERIES.forEach((series, position) => {
      const value = row[series.key];
      if (value === 0) return;
      const height = Math.max(1.5, (value / max) * (chartHeight - 14));
      const barX = left + position * barWidth;
      page.drawRectangle({ x: barX, y: base, width: barWidth - 1.5, height, color: series.color });
      if (barWidth >= 8) {
        const text = value.toString();
        const size = 6.5;
        page.drawText(text, {
          x: barX + (barWidth - 1.5 - fonts.bold.widthOfTextAtSize(text, size)) / 2,
          y: base + height + 2,
          size,
          font: fonts.bold,
          color: INK,
        });
      }
    });
    const label = monthLabel(row.month);
    const size = monthly.length > 9 ? 6.5 : 7.5;
    page.drawText(label, {
      x: PAGE.margin + index * slot + (slot - fonts.regular.widthOfTextAtSize(label, size)) / 2,
      y: base - 11,
      size,
      font: fonts.regular,
      color: MUTED,
    });
  });
  cursor.y = base - labelsHeight - 6;
}

async function propertyCard(doc: PDFDocument, cursor: Cursor, content: Content) {
  const { property } = content;
  const height = 112;
  const photoBox = { width: 150, height };
  cursor.ensure(height);
  const top = cursor.y;
  roundedRect(
    cursor.page,
    { x: PAGE.margin, y: top - height, width: CONTENT_WIDTH, height },
    { color: BRAND.sand, radius: 8 },
  );
  const image = await photos(doc, content, photoBox);
  const textX = PAGE.margin + (image ? photoBox.width + 16 : 16);
  const textWidth = PAGE.width - PAGE.margin - textX - 14;
  if (image) {
    cursor.page.drawImage(image, { x: PAGE.margin, y: top - height, ...photoBox });
  }
  let y = top - 14;
  y -= drawText(cursor.page, cursor.fonts, property.portalTitle, y, {
    size: 12.5,
    font: cursor.fonts.bold,
    x: textX,
    width: textWidth,
    maxLines: 2,
    leading: 1.2,
  });
  y -= 2;
  y -= drawText(
    cursor.page,
    cursor.fonts,
    `${kindLabel(property.propertyType)} · ${content.address}`,
    y,
    {
      size: 9,
      color: MUTED,
      x: textX,
      width: textWidth,
      maxLines: 2,
    },
  );
  y -= 6;
  const prices = content.prices.map((price) => `${operationLabel(price)}: ${amount(price)}`);
  if (prices.length > 0) {
    drawText(cursor.page, cursor.fonts, prices.join('   ·   '), y, {
      size: 11,
      font: cursor.fonts.bold,
      color: BRAND.dark,
      x: textX,
      width: textWidth,
      maxLines: 2,
    });
  }
  const status = `${STATUS_LABELS[property.status] ?? property.status} desde el ${dateFormat.format(property.statusChangedAt)}`;
  drawText(cursor.page, cursor.fonts, `Código ${property.code}  ·  ${status}`, top - height + 20, {
    size: 8.5,
    color: MUTED,
    x: textX,
    width: textWidth,
    maxLines: 1,
  });
  cursor.y = top - height - 16;
}

async function ownerReport(doc: PDFDocument, cursor: Cursor, content: Content) {
  const report = content.ownerReport;
  const owners = content.property.owners.map((owner) => owner.name);
  const period =
    report === undefined ? '' : `Período: del ${isoDay(report.from)} al ${isoDay(report.to)}`;
  titleBlock(
    cursor,
    'Reporte de gestión',
    'Así se movió tu propiedad',
    [period, owners.length === 0 ? '' : `Preparado para ${owners.join(', ')}`]
      .filter((part) => part !== '')
      .join('  ·  '),
    20,
  );
  await propertyCard(doc, cursor, content);
  if (report === undefined) return;

  cursor.section('Resumen del período', 70);
  kpiTiles(cursor, [
    { label: 'Visitas en portales', value: numberFormat.format(report.portalViews) },
    { label: 'Contactos desde portales', value: numberFormat.format(report.portalContacts) },
    { label: 'Consultas recibidas', value: numberFormat.format(report.inquiries) },
    { label: 'Envíos por email', value: numberFormat.format(report.emailSends) },
    { label: 'Envíos por WhatsApp', value: numberFormat.format(report.whatsappSends) },
    {
      label: 'Clientes que buscan algo así',
      value: numberFormat.format(report.interested),
    },
  ]);

  cursor.section('Actividad mes a mes', 150);
  activityChart(cursor, report.monthly);

  cursor.section('Publicaciones en portales', 50);
  if (report.publications.length === 0) {
    cursor.text('No estuvo publicada en portales en este período.', { size: 9.5, color: MUTED });
    cursor.gap(8);
  } else {
    const numeric = 62;
    table(
      cursor,
      [
        { title: 'Portal', width: CONTENT_WIDTH - 90 - 90 - numeric * 3 },
        { title: 'Estado', width: 90 },
        { title: 'Publicada desde', width: 90 },
        { title: 'Visitas', width: numeric, align: 'right' },
        { title: 'Contactos', width: numeric, align: 'right' },
        { title: 'Favoritos', width: numeric, align: 'right' },
      ],
      report.publications.map((publication) => ({
        cells: [
          PORTAL_LABELS[publication.portal] ?? publication.portal,
          PORTAL_STATUS_LABELS[publication.status] ?? publication.status,
          publication.publishedAt === undefined ? '-' : dateFormat.format(publication.publishedAt),
          numberFormat.format(publication.views),
          numberFormat.format(publication.contacts),
          numberFormat.format(publication.favorites),
        ],
      })),
    );
  }

  const note =
    'Las visitas, contactos y favoritos son los que informa cada portal. Las consultas y los envíos son los registrados por el equipo en el período. Los clientes que buscan algo así son los de nuestra base cuyas búsquedas coinciden con la propiedad.';
  cursor.ensure(textHeight(cursor.fonts, note, { size: 8, width: CONTENT_WIDTH }) + 8);
  cursor.text(note, { size: 8, font: cursor.fonts.italic, color: MUTED, leading: 1.4 });
  cursor.gap(14);

  contactCard(cursor, {
    title: '¿Querés repasar el reporte? Hablemos',
    agent: content.agent,
    branch: content.branch,
    companyName: content.company.name,
    link: content.webUrl === undefined ? undefined : `Tu propiedad en la web: ${content.webUrl}`,
  });
}

/** El contacto del pie: la sucursal; sin sucursal, el agente. */
function footerContact(content: Content) {
  if (content.branch) return content.branch;
  return content.agent && contactParts(content.agent).length > 0 ? content.agent : undefined;
}

export class PdfLibPropertyDocumentRenderer implements PropertyDocumentRenderer {
  async render(content: PropertyDocumentContent): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.setTitle(printable(`${FILE_TITLES[content.kind]} ${content.property.code}`));
    doc.setAuthor(printable(content.company.name));
    doc.setCreationDate(content.generatedAt);
    const fonts: Fonts = await embedFonts(doc);
    const cursor = new Cursor(doc, fonts);
    // La ficha se arma con react-pdf en su formato (ADR 0051, #175): acá no llega.
    if (content.kind === 'sheet') throw new Error('The sheet is rendered by the sheet renderer');
    if (content.kind === 'showcase') await showcase(doc, cursor, content);
    else await ownerReport(doc, cursor, content);
    await drawChrome(doc, fonts, {
      companyName: content.company.name,
      logo: content.company.logo,
      title: TITLES[content.kind],
      code: content.property.code,
      contact: footerContact(content),
      generatedAt: content.generatedAt,
      pageNumbers: content.kind !== 'showcase',
    });
    return doc.save();
  }
}
