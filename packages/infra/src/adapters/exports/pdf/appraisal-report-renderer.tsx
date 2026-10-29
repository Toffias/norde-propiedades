import type {
  AppraisalReportContent,
  AppraisalReportRenderer,
  ReportContact,
} from '@norde/core/appraisals';
import type { AppraisalValueRangeDto } from '@norde/core/appraisals/contracts';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ReactElement } from 'react';

import { formatMoney, formatPhone, formatSquareMeters, paragraphs } from './format';
import { PdfIcon } from './icons';
import { logoPng, photoJpeg } from './images';
import {
  PdfDocument,
  PdfFields,
  PdfPage,
  PdfPhoto,
  PdfSection,
  PdfSectionTitle,
  type PdfBranding,
  type PdfField,
} from './kit';
import { contactLine, contactTextLines, kindLabel } from './property-text';
import { renderPdf } from './render';
import { PDF_COLORS, PDF_TYPE } from './theme';

// El informe de la tasación (#175, etapa 4) con react-pdf: lo que se le entrega al propietario con
// la marca de la empresa. El mismo contenido que tenía con pdf-lib, con la identidad de los demás
// PDF: valor sugerido (también por m²), la propiedad, comparables con su promedio, observaciones,
// fotos, quién tasó y el alcance del informe.

const HERO = { width: 535, height: 250 } as const;
const GALLERY = { width: 263.5, height: 180 } as const;

const DISCLAIMER =
  'Este informe es una opinión de valor orientativa, elaborada a partir de la inspección del inmueble, sus características y propiedades comparables de la zona a la fecha de emisión. Los valores pueden variar según la evolución del mercado, la documentación y el estado del inmueble. No constituye una tasación judicial ni bancaria.';

const CONDITION_LABELS: Readonly<Record<string, string>> = {
  brand_new: 'A estrenar',
  excellent: 'Excelente',
  very_good: 'Muy bueno',
  good: 'Bueno',
  fair: 'Regular',
  to_renovate: 'A reciclar',
};

const dateFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const styles = StyleSheet.create({
  eyebrow: {
    fontSize: PDF_TYPE.small,
    lineHeight: 1.2,
    fontWeight: 800,
    letterSpacing: 0.8,
    color: PDF_COLORS.brand,
  },
  title: { fontSize: PDF_TYPE.title, lineHeight: 1.15, fontWeight: 800, marginTop: 3 },
  subtitle: {
    fontSize: PDF_TYPE.lead,
    lineHeight: 1.3,
    color: PDF_COLORS.muted,
    marginTop: 3,
    marginBottom: 10,
  },
  hero: { borderRadius: 6, overflow: 'hidden', marginBottom: 10 },
  values: { flexDirection: 'row', gap: 8 },
  value: {
    flexGrow: 1,
    flexBasis: 0,
    backgroundColor: PDF_COLORS.ink,
    borderLeftWidth: 4,
    borderLeftColor: PDF_COLORS.brand,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 4,
  },
  valueLabel: {
    fontSize: PDF_TYPE.small,
    lineHeight: 1.2,
    fontWeight: 800,
    letterSpacing: 0.8,
    color: PDF_COLORS.sand,
  },
  valueAmount: { fontSize: 20, lineHeight: 1.1, fontWeight: 800, color: PDF_COLORS.paper },
  valuePerM2: { fontSize: PDF_TYPE.body, lineHeight: 1.3, color: PDF_COLORS.sand },
  hint: { fontSize: PDF_TYPE.body, lineHeight: 1.35, color: PDF_COLORS.muted, marginBottom: 5 },
  table: { borderWidth: 0.6, borderColor: PDF_COLORS.rule, borderRadius: 6 },
  headRow: {
    flexDirection: 'row',
    backgroundColor: PDF_COLORS.sand,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  row: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderTopWidth: 0.6,
    borderTopColor: PDF_COLORS.rule,
  },
  cells: { flexDirection: 'row' },
  head: { fontSize: PDF_TYPE.small, lineHeight: 1.2, fontWeight: 800 },
  cell: { fontSize: PDF_TYPE.body, lineHeight: 1.3 },
  note: { fontSize: PDF_TYPE.small, lineHeight: 1.3, color: PDF_COLORS.muted, marginTop: 2 },
  address: { flex: 1, paddingRight: 6 },
  number: { width: 92, textAlign: 'right' },
  average: {
    backgroundColor: PDF_COLORS.sand,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 5,
    fontSize: PDF_TYPE.body,
    lineHeight: 1.3,
    fontWeight: 600,
  },
  paragraph: { fontSize: PDF_TYPE.lead, lineHeight: 1.5, marginBottom: 5 },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { borderRadius: 4, overflow: 'hidden' },
  contact: {
    backgroundColor: PDF_COLORS.ink,
    borderRadius: 8,
    padding: 14,
    marginTop: 14,
    gap: 10,
  },
  contactTitle: { fontSize: 12, lineHeight: 1.25, fontWeight: 800, color: PDF_COLORS.paper },
  contactColumns: { flexDirection: 'row', gap: 16 },
  contactColumn: { flex: 1, gap: 2 },
  contactLabel: {
    fontSize: PDF_TYPE.caption,
    lineHeight: 1.2,
    fontWeight: 800,
    letterSpacing: 0.8,
    color: PDF_COLORS.sand,
  },
  contactName: {
    fontSize: PDF_TYPE.lead,
    lineHeight: 1.3,
    fontWeight: 800,
    color: PDF_COLORS.paper,
  },
  contactLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  contactText: { fontSize: PDF_TYPE.body, lineHeight: 1.35, color: PDF_COLORS.sand },
  disclaimer: {
    borderWidth: 0.6,
    borderColor: PDF_COLORS.rule,
    borderRadius: 6,
    padding: 10,
    marginTop: 10,
    gap: 3,
  },
  disclaimerTitle: {
    fontSize: PDF_TYPE.caption,
    lineHeight: 1.2,
    fontWeight: 800,
    letterSpacing: 0.8,
    color: PDF_COLORS.muted,
  },
  disclaimerText: { fontSize: PDF_TYPE.small, lineHeight: 1.45, color: PDF_COLORS.muted },
});

// ---------- Lo que se imprime ----------

/** "USD 110.000 – 120.000", o un solo monto si el mínimo y el máximo coinciden. */
function range(value: AppraisalValueRangeDto): string {
  if (value.minCents === value.maxCents) return formatMoney(value.currency, value.minCents);
  const max = formatMoney(value.currency, value.maxCents).replace(`${value.currency}\u00a0`, '');
  return `${formatMoney(value.currency, value.minCents)} – ${max}`;
}

function facts(content: AppraisalReportContent): PdfField[] {
  const { appraisal } = content;
  const list: (PdfField | undefined)[] = [
    { label: 'Tipo', value: kindLabel(appraisal.propertyType) },
    appraisal.surfaceTotalM2 === undefined
      ? undefined
      : { label: 'Sup. total', value: formatSquareMeters(appraisal.surfaceTotalM2) },
    appraisal.surfaceCoveredM2 === undefined
      ? undefined
      : { label: 'Sup. cubierta', value: formatSquareMeters(appraisal.surfaceCoveredM2) },
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
  return list.filter((fact): fact is PdfField => fact !== undefined);
}

// ---------- Piezas ----------

function Intro({ content }: { readonly content: AppraisalReportContent }): ReactElement {
  const { appraisal } = content;
  const address = appraisal.address?.trim() ?? '';
  const subtitle = [
    address === '' ? undefined : kindLabel(appraisal.propertyType),
    appraisal.requester.name === undefined
      ? undefined
      : `Preparado para ${appraisal.requester.name}`,
    `Emitido el ${dateFormat.format(content.generatedAt)}`,
  ].filter((part) => part !== undefined);
  return (
    <View>
      <Text style={styles.eyebrow}>INFORME DE TASACIÓN · {appraisal.code}</Text>
      <Text style={styles.title}>
        {address === '' ? kindLabel(appraisal.propertyType) : address}
      </Text>
      <Text style={styles.subtitle}>{subtitle.join('  ·  ')}</Text>
    </View>
  );
}

/** Una tarjeta oscura por operación: el rango sugerido y su valor por m². */
function Values({ content }: { readonly content: AppraisalReportContent }): ReactElement | null {
  const { sale, rent } = content.appraisal.result;
  const { figures } = content;
  const cards = [
    sale === undefined
      ? undefined
      : { label: 'VALOR SUGERIDO DE VENTA', value: sale, perM2: figures.salePerM2 },
    rent === undefined
      ? undefined
      : { label: 'VALOR SUGERIDO DE ALQUILER MENSUAL', value: rent, perM2: figures.rentPerM2 },
  ].filter((card) => card !== undefined);
  if (cards.length === 0) return null;
  return (
    <View style={styles.values} wrap={false}>
      {cards.map((card) => (
        <View key={card.label} style={styles.value}>
          <Text style={styles.valueLabel}>{card.label}</Text>
          <Text style={styles.valueAmount}>{range(card.value)}</Text>
          {card.perM2 === undefined || figures.surfaceM2 === undefined ? null : (
            <Text style={styles.valuePerM2}>
              {range(card.perM2)} por m² · sobre {formatSquareMeters(figures.surfaceM2)}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

function Comparables({
  content,
}: {
  readonly content: AppraisalReportContent;
}): ReactElement | null {
  const items = content.appraisal.result.comparables;
  if (items.length === 0) return null;
  return (
    <PdfSection title="Comparables de la zona">
      <Text style={styles.hint}>
        Propiedades parecidas, publicadas o vendidas, que respaldan el valor sugerido.
      </Text>
      <View style={styles.table}>
        <View style={styles.headRow} fixed>
          <Text style={[styles.head, styles.address]}>Dirección</Text>
          <Text style={[styles.head, styles.number]}>Precio</Text>
          <Text style={[styles.head, styles.number]}>Superficie</Text>
          <Text style={[styles.head, styles.number]}>Valor por m²</Text>
        </View>
        {items.map((comparable, index) => (
          <View key={index} style={styles.row} wrap={false}>
            <View style={styles.cells}>
              <Text style={[styles.cell, styles.address]}>{comparable.address}</Text>
              <Text style={[styles.cell, styles.number]}>
                {formatMoney(comparable.price.currency, comparable.price.amountCents)}
              </Text>
              <Text style={[styles.cell, styles.number]}>
                {comparable.surfaceM2 === undefined
                  ? '-'
                  : formatSquareMeters(comparable.surfaceM2)}
              </Text>
              <Text style={[styles.cell, styles.number]}>
                {comparable.pricePerM2 === undefined
                  ? '-'
                  : formatMoney(comparable.pricePerM2.currency, comparable.pricePerM2.amountCents)}
              </Text>
            </View>
            {comparable.note === undefined || comparable.note === '' ? null : (
              <Text style={styles.note}>{comparable.note}</Text>
            )}
          </View>
        ))}
      </View>
      {content.figures.comparablesAverages.map((average) => (
        <Text key={average.currency} style={styles.average}>
          Promedio de los comparables: {formatMoney(average.currency, average.pricePerM2Cents)} por
          m² ({average.count.toString()} {average.count === 1 ? 'comparable' : 'comparables'} con
          superficie)
        </Text>
      ))}
    </PdfSection>
  );
}

function Observations({ text }: { readonly text: string | undefined }): ReactElement | null {
  const [first, ...rest] = paragraphs(text ?? '');
  if (first === undefined) return null;
  return (
    <PdfSection title="Observaciones y criterios">
      <Text style={styles.paragraph}>{first}</Text>
      {rest.map((paragraph, index) => (
        <Text key={index} style={styles.paragraph}>
          {paragraph}
        </Text>
      ))}
    </PdfSection>
  );
}

function ContactLines({ contact }: { readonly contact: ReportContact }): ReactElement {
  const text = contactTextLines(contact);
  if (text !== undefined) {
    return (
      <>
        {text.map((line, index) => (
          <Text key={index} style={styles.contactText}>
            {line}
          </Text>
        ))}
      </>
    );
  }
  const lines = [
    contact.address === undefined
      ? undefined
      : { icon: 'location' as const, text: contact.address },
    contact.phone === undefined
      ? undefined
      : { icon: 'phone' as const, text: formatPhone(contact.phone) },
    contact.whatsapp === undefined
      ? undefined
      : { icon: 'whatsapp' as const, text: formatPhone(contact.whatsapp) },
    contact.email === undefined ? undefined : { icon: 'email' as const, text: contact.email },
  ].filter((line) => line !== undefined);
  return (
    <>
      {lines.map((line) => (
        <View key={line.icon} style={styles.contactLine}>
          <PdfIcon name={line.icon} size={9} color={PDF_COLORS.sand} />
          <Text style={styles.contactText}>{line.text}</Text>
        </View>
      ))}
    </>
  );
}

/** "¿Querés avanzar? Hablemos": quién tasó y la sucursal. */
function Contact({ content }: { readonly content: AppraisalReportContent }): ReactElement {
  const appraiserName = content.appraiser?.name ?? content.appraisal.appraiser?.name;
  return (
    <View style={styles.contact} wrap={false}>
      <Text style={styles.contactTitle}>¿Querés avanzar con la venta o el alquiler? Hablemos</Text>
      <View style={styles.contactColumns}>
        {appraiserName === undefined ? null : (
          <View style={styles.contactColumn}>
            <Text style={styles.contactLabel}>TASÓ</Text>
            <Text style={styles.contactName}>{appraiserName}</Text>
            {content.appraiser === undefined ? null : <ContactLines contact={content.appraiser} />}
          </View>
        )}
        {content.branch === undefined ? null : (
          <View style={styles.contactColumn}>
            <Text style={styles.contactLabel}>SUCURSAL</Text>
            <Text style={styles.contactName}>{content.branch.name}</Text>
            <ContactLines contact={content.branch} />
          </View>
        )}
      </View>
    </View>
  );
}

function Gallery({ photos }: { readonly photos: readonly Uint8Array[] }): ReactElement {
  return (
    <View style={styles.gallery}>
      {photos.map((bytes, index) => (
        <View key={index} style={styles.photo} wrap={false}>
          <PdfPhoto bytes={bytes} {...GALLERY} />
        </View>
      ))}
    </View>
  );
}

/** El informe de la tasación con react-pdf (ADR 0051). */
export class ReactPdfAppraisalReportRenderer implements AppraisalReportRenderer {
  async render(content: AppraisalReportContent): Promise<Uint8Array> {
    // Las fotos llegan de a una: se achican apenas llegan y los originales no quedan en memoria.
    // La primera que se puede leer va arriba; las demás, en la galería del final.
    let hero: Uint8Array | undefined;
    const gallery: Uint8Array[] = [];
    for await (const bytes of content.photos) {
      const jpeg = await photoJpeg(bytes, hero === undefined ? HERO : GALLERY);
      if (jpeg === undefined) continue;
      if (hero === undefined) hero = jpeg;
      else gallery.push(jpeg);
    }
    const branding: PdfBranding = {
      logo: await logoPng(content.company.logo),
      companyName: content.company.name,
      contactLine: contactLine(content.branch),
    };
    const list = facts(content);
    return renderPdf(
      <PdfDocument
        meta={{ title: `Tasación ${content.appraisal.code}`, author: content.company.name }}
      >
        <PdfPage branding={branding} footerNote="Informe de tasación">
          <Intro content={content} />
          {hero === undefined ? null : (
            <View style={styles.hero}>
              <PdfPhoto bytes={hero} {...HERO} />
            </View>
          )}
          <Values content={content} />
          {list.length === 0 ? null : (
            <PdfSection title="La propiedad" keepTogether>
              <PdfFields fields={list} columns={4} />
            </PdfSection>
          )}
          <Comparables content={content} />
          <Observations text={content.appraisal.result.observations} />
          {gallery.length === 0 ? null : (
            <View>
              {/* El título va con la primera fila de fotos: nunca queda solo al pie de la hoja. */}
              <View wrap={false}>
                <PdfSectionTitle title="Fotos" />
                <Gallery photos={gallery.slice(0, 2)} />
              </View>
              {gallery.length > 2 ? (
                <View style={{ marginTop: 8 }}>
                  <Gallery photos={gallery.slice(2)} />
                </View>
              ) : null}
            </View>
          )}
          <Contact content={content} />
          <View style={styles.disclaimer} wrap={false}>
            <Text style={styles.disclaimerTitle}>ALCANCE DEL INFORME</Text>
            <Text style={styles.disclaimerText}>{DISCLAIMER}</Text>
          </View>
        </PdfPage>
      </PdfDocument>,
    );
  }
}
