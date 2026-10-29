import type { AppraisalReportContent, AppraisalReportRenderer } from '@norde/core/appraisals';
import type { AppraisalValueRangeDto } from '@norde/core/appraisals/contracts';
import { PROPERTY_KIND_LABELS, PROPERTY_KINDS } from '@norde/core/properties';
import { PDFDocument } from 'pdf-lib';

import {
  BRAND,
  CONDITION_LABELS,
  contactCard,
  CONTENT_WIDTH,
  Cursor,
  dateFormat,
  drawChrome,
  drawText,
  embedFonts,
  embedPhoto,
  factsGrid,
  INK,
  fitSize,
  moneyRange,
  MUTED,
  PAGE,
  photoGrid,
  printable,
  roundedRect,
  roundMoney,
  squareMeters,
  table,
  textHeight,
  type Fact,
} from './pdf-kit';

// El informe de la tasación con pdf-lib, en español: lo que se le entrega al propietario con la
// marca de la empresa. Valor sugerido (también por m²), la propiedad, comparables con su promedio,
// observaciones, fotos, quién tasó y el alcance del informe.

const HERO = { width: CONTENT_WIDTH, height: 250 };

const DISCLAIMER =
  'Este informe es una opinión de valor orientativa, elaborada a partir de la inspección del inmueble, sus características y propiedades comparables de la zona a la fecha de emisión. Los valores pueden variar según la evolución del mercado, la documentación y el estado del inmueble. No constituye una tasación judicial ni bancaria.';

type Content = AppraisalReportContent;

function kindLabel(kind: string): string {
  const known = PROPERTY_KINDS.find((candidate) => candidate === kind);
  return known === undefined ? kind : PROPERTY_KIND_LABELS[known];
}

/** "USD 110.000 – 120.000", o un solo monto si el mínimo y el máximo coinciden. */
function range(value: AppraisalValueRangeDto): string {
  return moneyRange(value.currency, value.minCents, value.maxCents);
}

function facts(content: Content): Fact[] {
  const { appraisal } = content;
  const list: (Fact | undefined)[] = [
    { label: 'Tipo', value: kindLabel(appraisal.propertyType) },
    appraisal.surfaceTotalM2 === undefined
      ? undefined
      : { label: 'Sup. total', value: squareMeters(appraisal.surfaceTotalM2) },
    appraisal.surfaceCoveredM2 === undefined
      ? undefined
      : { label: 'Sup. cubierta', value: squareMeters(appraisal.surfaceCoveredM2) },
    appraisal.rooms === undefined
      ? undefined
      : { label: 'Ambientes', value: appraisal.rooms.toString() },
    appraisal.bedrooms === undefined
      ? undefined
      : { label: 'Dormitorios', value: appraisal.bedrooms.toString() },
    appraisal.bathrooms === undefined
      ? undefined
      : { label: 'Baños', value: appraisal.bathrooms.toString() },
    appraisal.condition === undefined
      ? undefined
      : { label: 'Estado', value: CONDITION_LABELS[appraisal.condition] ?? appraisal.condition },
    appraisal.visitAt === undefined
      ? undefined
      : { label: 'Visita', value: dateFormat.format(appraisal.visitAt) },
  ];
  return list.filter((fact): fact is Fact => fact !== undefined);
}

function intro(cursor: Cursor, content: Content) {
  const { appraisal } = content;
  cursor.text('INFORME DE TASACIÓN', { size: 8.5, font: cursor.fonts.bold, color: BRAND.accent });
  cursor.gap(3);
  const title =
    appraisal.address === undefined || appraisal.address.trim() === ''
      ? kindLabel(appraisal.propertyType)
      : appraisal.address;
  cursor.text(title, { size: 21, font: cursor.fonts.bold, leading: 1.15, maxLines: 2 });
  cursor.gap(2);
  const subtitle = [
    appraisal.address === undefined ? undefined : kindLabel(appraisal.propertyType),
    appraisal.requester.name === undefined
      ? undefined
      : `Preparado para ${appraisal.requester.name}`,
    `Emitido el ${dateFormat.format(content.generatedAt)}`,
  ].filter((part) => part !== undefined);
  cursor.text(subtitle.join('  ·  '), { size: 10.5, color: MUTED });
  cursor.gap(12);
}

/** Una tarjeta oscura por operación: el rango sugerido y su valor por m². */
function valueCards(cursor: Cursor, content: Content) {
  const { sale, rent } = content.appraisal.result;
  const { figures } = content;
  const cards = [
    sale === undefined
      ? undefined
      : { label: 'Valor sugerido de venta', value: sale, perM2: figures.salePerM2 },
    rent === undefined
      ? undefined
      : { label: 'Valor sugerido de alquiler mensual', value: rent, perM2: figures.rentPerM2 },
  ].filter((card) => card !== undefined);
  if (cards.length === 0) return;
  const gap = 10;
  const width = (CONTENT_WIDTH - gap * (cards.length - 1)) / cards.length;
  const height = 86;
  cursor.ensure(height + 10);
  const top = cursor.y;
  cards.forEach((card, index) => {
    const x = PAGE.margin + index * (width + gap);
    roundedRect(
      cursor.page,
      { x, y: top - height, width, height },
      { color: BRAND.dark, radius: 8 },
    );
    cursor.page.drawRectangle({ x, y: top - height, width: 4, height, color: BRAND.accent });
    drawText(cursor.page, cursor.fonts, card.label.toUpperCase(), top - 14, {
      size: 7.5,
      font: cursor.fonts.bold,
      color: BRAND.cream,
      x: x + 18,
      width: width - 32,
    });
    const value = range(card.value);
    drawText(cursor.page, cursor.fonts, value, top - 28, {
      size: fitSize(cursor.fonts.bold, value, cards.length === 1 ? 24 : 19, width - 32, 12),
      font: cursor.fonts.bold,
      color: BRAND.white,
      x: x + 18,
      width: width - 32,
      maxLines: 1,
    });
    if (card.perM2 !== undefined && figures.surfaceM2 !== undefined) {
      drawText(
        cursor.page,
        cursor.fonts,
        `${range(card.perM2)} por m²  ·  sobre ${squareMeters(figures.surfaceM2)}`,
        top - 60,
        { size: 9, color: BRAND.cream, x: x + 18, width: width - 32, maxLines: 1 },
      );
    }
  });
  cursor.y = top - height - 14;
}

function comparables(cursor: Cursor, content: Content) {
  const items = content.appraisal.result.comparables;
  if (items.length === 0) return;
  cursor.section('Comparables de la zona', 110);
  cursor.text('Propiedades parecidas, publicadas o vendidas, que respaldan el valor sugerido.', {
    size: 9,
    color: MUTED,
  });
  cursor.gap(6);
  table(
    cursor,
    [
      { title: 'Dirección', width: CONTENT_WIDTH - 110 - 85 - 100 },
      { title: 'Precio', width: 110, align: 'right' },
      { title: 'Superficie', width: 85, align: 'right' },
      { title: 'Valor por m²', width: 100, align: 'right' },
    ],
    items.map((comparable) => ({
      cells: [
        comparable.address,
        roundMoney(comparable.price.currency, comparable.price.amountCents),
        comparable.surfaceM2 === undefined ? '-' : squareMeters(comparable.surfaceM2),
        comparable.pricePerM2 === undefined
          ? '-'
          : roundMoney(comparable.pricePerM2.currency, comparable.pricePerM2.amountCents),
      ],
      note: comparable.note,
    })),
  );
  for (const average of content.figures.comparablesAverages) {
    const text = `Promedio de los comparables: ${roundMoney(average.currency, average.pricePerM2Cents)} por m² (${average.count.toString()} ${average.count === 1 ? 'comparable' : 'comparables'} con superficie)`;
    cursor.ensure(22);
    const top = cursor.y;
    roundedRect(
      cursor.page,
      { x: PAGE.margin, y: top - 22, width: CONTENT_WIDTH, height: 22 },
      { color: BRAND.sand, radius: 4 },
    );
    drawText(cursor.page, cursor.fonts, text, top - 6.5, {
      size: 9,
      font: cursor.fonts.bold,
      color: BRAND.dark,
      x: PAGE.margin + 10,
      width: CONTENT_WIDTH - 20,
      maxLines: 1,
    });
    cursor.y = top - 28;
  }
  cursor.gap(4);
}

function observations(cursor: Cursor, text: string | undefined) {
  if (text === undefined || text.trim() === '') return;
  cursor.section('Observaciones y criterios', 30);
  cursor.text(text, { size: 10, leading: 1.45, color: INK });
  cursor.gap(8);
}

function disclaimer(cursor: Cursor) {
  const pad = 12;
  const height =
    textHeight(cursor.fonts, DISCLAIMER, {
      size: 8,
      width: CONTENT_WIDTH - pad * 2,
      leading: 1.4,
    }) +
    pad * 2 +
    12;
  cursor.ensure(height);
  const top = cursor.y;
  roundedRect(
    cursor.page,
    { x: PAGE.margin, y: top - height, width: CONTENT_WIDTH, height },
    { border: BRAND.sandDark, radius: 6 },
  );
  drawText(cursor.page, cursor.fonts, 'ALCANCE DEL INFORME', top - pad, {
    size: 7,
    font: cursor.fonts.bold,
    color: MUTED,
    x: PAGE.margin + pad,
  });
  drawText(cursor.page, cursor.fonts, DISCLAIMER, top - pad - 12, {
    size: 8,
    font: cursor.fonts.italic,
    color: MUTED,
    x: PAGE.margin + pad,
    width: CONTENT_WIDTH - pad * 2,
    leading: 1.4,
  });
  cursor.y = top - height - 8;
}

/** Lo que queda de las fotos, después de la que va arriba. */
async function* remaining(rest: AsyncIterator<Uint8Array>) {
  for (let next = await rest.next(); next.done !== true; next = await rest.next()) {
    yield next.value;
  }
}

export class PdfLibAppraisalReportRenderer implements AppraisalReportRenderer {
  async render(content: AppraisalReportContent): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.setTitle(printable(`Tasación ${content.appraisal.code}`));
    doc.setAuthor(printable(content.company.name));
    doc.setCreationDate(content.generatedAt);
    const fonts = await embedFonts(doc);
    const cursor = new Cursor(doc, fonts);

    intro(cursor, content);

    // La primera foto que se pueda leer va arriba; las demás, en la galería del final.
    const photos = content.photos[Symbol.asyncIterator]();
    let hero;
    for (let next = await photos.next(); next.done !== true; next = await photos.next()) {
      hero = await embedPhoto(doc, next.value, HERO);
      if (hero) break;
    }
    if (hero) {
      cursor.page.drawImage(hero, { x: PAGE.margin, y: cursor.y - HERO.height, ...HERO });
      cursor.gap(HERO.height + 12);
    }

    valueCards(cursor, content);
    const list = facts(content);
    if (list.length > 0) {
      cursor.section('La propiedad', 50);
      factsGrid(cursor, list, 4);
      cursor.gap(4);
    }
    comparables(cursor, content);
    observations(cursor, content.appraisal.result.observations);
    await photoGrid(cursor, doc, remaining(photos), {
      columns: 2,
      ratio: 0.72,
      title: 'Fotos',
    });

    cursor.gap(6);
    contactCard(cursor, {
      title: '¿Querés avanzar con la venta o el alquiler? Hablemos',
      agent:
        content.appraiser ??
        (content.appraisal.appraiser?.name === undefined
          ? undefined
          : {
              name: content.appraisal.appraiser.name,
              address: undefined,
              phone: undefined,
              whatsapp: undefined,
              email: undefined,
            }),
      agentLabel: 'Tasó',
      branch: content.branch,
      companyName: content.company.name,
    });
    disclaimer(cursor);

    await drawChrome(doc, fonts, {
      companyName: content.company.name,
      logo: content.company.logo,
      title: 'Informe de tasación',
      code: content.appraisal.code,
      contact: content.branch,
      generatedAt: content.generatedAt,
    });
    return doc.save();
  }
}
