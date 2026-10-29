import type {
  DocumentContact,
  OwnerReportContent,
  OwnerReportRenderer,
  PdfPrice,
} from '@norde/core/properties';
import { Image, Link, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ReactElement, ReactNode } from 'react';

import { formatPhone } from './format';
import { PdfIcon, type PdfIconName } from './icons';
import { logoPng, photoJpeg } from './images';
import {
  PdfDocument,
  PdfKeyFacts,
  PdfPage,
  PdfPhoto,
  PdfPriceTag,
  PdfSection,
  type PdfBranding,
} from './kit';
import { PORTAL_LOGOS } from './portal-logos.generated';
import {
  amount,
  contactLine,
  contactTextLines,
  keyFacts,
  kindLabel,
  operationLabel,
} from './property-text';
import { renderPdf } from './render';
import { PDF_COLORS, PDF_TYPE } from './theme';

// El reporte al propietario (#175, etapa 3) con react-pdf, con las tarjetas del de Tokko mejoradas:
// - la tarjeta de la propiedad con foto, datos clave y precio;
// - una tabla para comparar los envíos y las consultas de los últimos 15 y 30 días y desde el alta;
// - el movimiento del período elegido, con el gráfico mes a mes;
// - las estadísticas de cada portal y cuenta, cada una con su explicación;
// - las publicaciones activas con el logo del portal, la operación, el precio y el link al aviso;
// - "Tu productor" y los datos de la empresa al final.

const PHOTO = { width: 180, height: 128 } as const;
const PORTAL_LOGO = { width: 92, height: 26 } as const;
const CHART_HEIGHT = 110;
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const PORTAL_NAMES: Readonly<Record<string, string>> = {
  mercadolibre: 'MercadoLibre',
  mercadolibre_developments: 'MercadoLibre · Emprendimientos',
  zonaprop: 'Zonaprop',
  argenprop: 'Argenprop',
};
const PUBLICATION_STATUS_LABELS: Readonly<Record<string, string>> = {
  pending: 'Pendiente',
  published: 'Publicada',
  paused: 'Pausada',
  error: 'Con error',
  unpublished: 'Despublicada',
};

const styles = StyleSheet.create({
  title: { fontSize: PDF_TYPE.title, lineHeight: 1.15, fontWeight: 800 },
  subtitle: {
    fontSize: PDF_TYPE.small,
    lineHeight: 1.3,
    color: PDF_COLORS.muted,
    letterSpacing: 0.6,
    marginTop: 3,
    marginBottom: 10,
  },
  card: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: PDF_COLORS.sand,
    borderRadius: 8,
    padding: 10,
  },
  cardPhoto: { borderRadius: 6, overflow: 'hidden' },
  cardBody: { flex: 1, gap: 4, justifyContent: 'center' },
  eyebrow: {
    fontSize: PDF_TYPE.small,
    lineHeight: 1.2,
    fontWeight: 800,
    letterSpacing: 0.8,
    color: PDF_COLORS.brand,
  },
  cardTitle: { fontSize: 13, lineHeight: 1.2, fontWeight: 800 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  muted: { fontSize: PDF_TYPE.body, lineHeight: 1.3, color: PDF_COLORS.muted },
  prices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  table: { borderWidth: 0.6, borderColor: PDF_COLORS.rule, borderRadius: 6 },
  headRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: PDF_COLORS.sand,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopWidth: 0.6,
    borderTopColor: PDF_COLORS.rule,
  },
  head: { fontSize: PDF_TYPE.small, lineHeight: 1.2, fontWeight: 800 },
  headHint: { fontSize: PDF_TYPE.caption, lineHeight: 1.2, color: PDF_COLORS.muted, marginTop: 1 },
  labelCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  numberCell: { width: 92, textAlign: 'right' },
  cellLabel: { fontSize: PDF_TYPE.body, lineHeight: 1.3, fontWeight: 600 },
  cellHint: { fontSize: PDF_TYPE.small, lineHeight: 1.3, color: PDF_COLORS.muted },
  number: { fontSize: PDF_TYPE.lead, lineHeight: 1.2, fontWeight: 800, textAlign: 'right' },
  tiles: { flexDirection: 'row', gap: 6 },
  tile: {
    flexGrow: 1,
    flexBasis: 0,
    backgroundColor: PDF_COLORS.sand,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 3,
  },
  tileValue: { fontSize: 18, lineHeight: 1.1, fontWeight: 800 },
  tileLabel: { fontSize: PDF_TYPE.small, lineHeight: 1.25, color: PDF_COLORS.muted },
  chart: { marginTop: 10 },
  legend: { flexDirection: 'row', gap: 12, marginBottom: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendSwatch: { width: 8, height: 8, borderRadius: 2 },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_HEIGHT,
    borderBottomWidth: 0.8,
    borderBottomColor: PDF_COLORS.muted,
  },
  month: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 1,
  },
  bar: { width: 7, borderTopLeftRadius: 1.5, borderTopRightRadius: 1.5 },
  barValue: { fontSize: 5.5, lineHeight: 1, fontWeight: 800, textAlign: 'center', marginBottom: 1 },
  monthLabels: { flexDirection: 'row', marginTop: 3 },
  monthLabel: { flex: 1, fontSize: PDF_TYPE.caption, lineHeight: 1, textAlign: 'center' },
  portal: { marginTop: 10 },
  portalHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 5 },
  portalLogo: { ...PORTAL_LOGO, objectFit: 'contain', objectPosition: 'left' },
  portalName: { fontSize: PDF_TYPE.lead, lineHeight: 1.2, fontWeight: 800 },
  pill: {
    fontSize: PDF_TYPE.caption,
    lineHeight: 1,
    fontWeight: 800,
    color: PDF_COLORS.muted,
    borderWidth: 0.6,
    borderColor: PDF_COLORS.rule,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingTop: 3,
    paddingBottom: 2,
  },
  publication: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: PDF_COLORS.sand,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 5,
  },
  publicationText: { flex: 1, fontSize: PDF_TYPE.body, lineHeight: 1.3 },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    fontSize: PDF_TYPE.body,
    lineHeight: 1.2,
    fontWeight: 800,
    color: PDF_COLORS.brand,
    textDecoration: 'none',
  },
  footer: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    backgroundColor: PDF_COLORS.sand,
    borderRadius: 8,
    padding: 14,
    marginTop: 14,
  },
  producer: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PDF_COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 12, lineHeight: 1, fontWeight: 800, color: PDF_COLORS.paper },
  footerLabel: {
    fontSize: PDF_TYPE.caption,
    lineHeight: 1.2,
    fontWeight: 800,
    letterSpacing: 0.8,
    color: PDF_COLORS.muted,
  },
  footerName: { fontSize: PDF_TYPE.lead, lineHeight: 1.25, fontWeight: 800 },
  company: { flex: 1, gap: 2 },
  companyLogo: { height: 28, maxWidth: 140, objectFit: 'contain', objectPosition: 'left' },
});

// ---------- Lo que se imprime ----------

/** `AAAA-MM-DD` → "30/09/2026". */
function day(date: string): string {
  const [year = '', month = '', dayOfMonth = ''] = date.split('-');
  return `${dayOfMonth}/${month}/${year}`;
}

const generatedFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** "2026-09" → "sep 26". */
function monthLabel(month: string): string {
  const [year = '', value = '1'] = month.split('-');
  return `${MONTHS[Number(value) - 1] ?? value} ${year.slice(2)}`;
}

const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

function count(value: number): string {
  return integer.format(value);
}

function portalName(portal: string): string {
  return PORTAL_NAMES[portal] ?? `${portal.charAt(0).toUpperCase()}${portal.slice(1)}`;
}

/** El logo del portal; las dos cuentas de MercadoLibre usan el mismo. */
function portalLogo(portal: string): string | undefined {
  if (portal.startsWith('mercadolibre')) return PORTAL_LOGOS.mercadolibre;
  return portal === 'zonaprop' ? PORTAL_LOGOS.zonaprop : undefined;
}

/** "Venta · USD 370.000": la operación del aviso con su precio; sin operación, todas. */
function publicationPrices(prices: readonly PdfPrice[], operation: string | undefined): string {
  const shown =
    operation === undefined ? prices : prices.filter((price) => price.operation === operation);
  return shown.map((price) => `${operationLabel(price)} · ${amount(price)}`).join('  ·  ');
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part !== '')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function logoSrc(logo: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(logo).toString('base64')}`;
}

// ---------- Piezas ----------

interface Prepared {
  readonly content: OwnerReportContent;
  readonly photo: Uint8Array | undefined;
  readonly logo: Uint8Array | undefined;
}

function PropertyCard({ prepared }: { readonly prepared: Prepared }): ReactElement {
  const { content, photo } = prepared;
  const { property } = content;
  return (
    <View style={styles.card} wrap={false}>
      {photo === undefined ? null : (
        <View style={styles.cardPhoto}>
          <PdfPhoto bytes={photo} {...PHOTO} />
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.eyebrow}>
          {kindLabel(property.propertyType).toUpperCase()} · REF. {property.code}
        </Text>
        <Text style={styles.cardTitle}>{property.portalTitle}</Text>
        {content.address === '' ? null : (
          <View style={styles.addressRow}>
            <PdfIcon name="location" size={9} />
            <Text style={styles.muted}>{content.address}</Text>
          </View>
        )}
        <PdfKeyFacts facts={keyFacts(property)} />
        <View style={styles.prices}>
          {content.prices.map((price) => (
            <PdfPriceTag
              key={`${price.operation}-${price.currency}`}
              operation={operationLabel(price)}
              amount={amount(price)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function NumberCell({ value }: { readonly value: number }): ReactElement {
  return (
    <View style={styles.numberCell}>
      <Text style={styles.number}>{count(value)}</Text>
    </View>
  );
}

function RowLabel({
  icon,
  label,
  hint,
}: {
  readonly icon: PdfIconName;
  readonly label: string;
  readonly hint?: string;
}): ReactElement {
  return (
    <View style={styles.labelCell}>
      <PdfIcon name={icon} size={11} />
      <Text style={styles.cellLabel}>
        {label}
        {hint === undefined ? '' : '  '}
        {hint === undefined ? null : <Text style={styles.cellHint}>{hint}</Text>}
      </Text>
    </View>
  );
}

/** Los envíos y las consultas de los últimos 15 y 30 días y desde el alta. */
function Comparison({ prepared }: { readonly prepared: Prepared }): ReactElement {
  const { windows } = prepared.content.report;
  const columns = [windows.last15Days, windows.last30Days, windows.sinceCreation];
  const rows = [
    { icon: 'email', label: 'Fichas enviadas por email', field: 'emailSends' },
    { icon: 'whatsapp', label: 'Fichas enviadas por WhatsApp', field: 'whatsappSends' },
    { icon: 'inquiry', label: 'Consultas recibidas', field: 'inquiries' },
  ] as const;
  return (
    <PdfSection title="Movimiento de la propiedad" keepTogether>
      <View style={styles.table}>
        <View style={styles.headRow}>
          <View style={styles.labelCell}>
            <Text style={styles.head}>Hasta el {day(prepared.content.report.to)}</Text>
          </View>
          <View style={styles.numberCell}>
            <Text style={[styles.head, { textAlign: 'right' }]}>Últimos 15 días</Text>
          </View>
          <View style={styles.numberCell}>
            <Text style={[styles.head, { textAlign: 'right' }]}>Últimos 30 días</Text>
          </View>
          <View style={styles.numberCell}>
            <Text style={[styles.head, { textAlign: 'right' }]}>Desde el alta</Text>
            <Text style={[styles.headHint, { textAlign: 'right' }]}>
              {day(windows.sinceCreation.from)}
            </Text>
          </View>
        </View>
        {rows.map((row) => (
          <View key={row.field} style={styles.row}>
            <RowLabel icon={row.icon} label={row.label} />
            {columns.map((column, index) => (
              <NumberCell key={index} value={column[row.field]} />
            ))}
          </View>
        ))}
      </View>
    </PdfSection>
  );
}

function Tile({ value, label }: { readonly value: number; readonly label: string }): ReactElement {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{count(value)}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const SERIES = [
  { key: 'inquiries', label: 'Consultas', color: PDF_COLORS.brand },
  { key: 'emailSends', label: 'Envíos por email', color: PDF_COLORS.ink },
  { key: 'whatsappSends', label: 'Envíos por WhatsApp', color: '#b8a58f' },
] as const;

/** Barras por mes: consultas, envíos por email y por WhatsApp. Con un solo mes no aporta. */
function MonthlyChart({ prepared }: { readonly prepared: Prepared }): ReactElement | null {
  const { monthly } = prepared.content.report;
  const max = Math.max(0, ...monthly.flatMap((row) => SERIES.map((series) => row[series.key])));
  if (monthly.length < 2 || max === 0) return null;
  const labelEvery = monthly.length > 12 ? 2 : 1;
  return (
    <View style={styles.chart} wrap={false}>
      <View style={styles.legend}>
        {SERIES.map((series) => (
          <View key={series.key} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: series.color }]} />
            <Text style={styles.cellHint}>{series.label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.bars}>
        {monthly.map((row) => (
          <View key={row.month} style={styles.month}>
            {SERIES.map((series) => {
              const value = row[series.key];
              const height = value === 0 ? 0 : Math.max(2, (value / max) * (CHART_HEIGHT - 14));
              return (
                <View key={series.key}>
                  {value === 0 ? null : <Text style={styles.barValue}>{value.toString()}</Text>}
                  <View style={[styles.bar, { height, backgroundColor: series.color }]} />
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.monthLabels}>
        {monthly.map((row, index) => (
          <Text key={row.month} style={styles.monthLabel}>
            {index % labelEvery === 0 ? monthLabel(row.month) : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Period({ prepared }: { readonly prepared: Prepared }): ReactElement {
  const { report, options } = prepared.content;
  const tiles = [
    ...(options.statistics
      ? [
          { value: report.portalViews, label: 'Visitas en los portales' },
          { value: report.portalContacts, label: 'Contactos en los portales' },
        ]
      : []),
    { value: report.emailSends + report.whatsappSends, label: 'Fichas enviadas' },
    { value: report.inquiries, label: 'Consultas recibidas' },
    { value: report.interested, label: 'Clientes buscando algo así' },
  ];
  return (
    <PdfSection title={`Del ${day(report.from)} al ${day(report.to)}`}>
      <View style={styles.tiles} wrap={false}>
        {tiles.map((tile) => (
          <Tile key={tile.label} {...tile} />
        ))}
      </View>
      <MonthlyChart prepared={prepared} />
    </PdfSection>
  );
}

/** Las estadísticas de cada aviso, con lo que significa cada número. */
function PortalStatistics({ prepared }: { readonly prepared: Prepared }): ReactElement | null {
  const { report, prices } = prepared.content;
  if (report.publications.length === 0) return null;
  const rows = [
    { icon: 'views', label: 'Vistas', hint: 'Personas que entraron al aviso', field: 'views' },
    {
      icon: 'contacts',
      label: 'Contactos',
      hint: 'Personas que consultaron o pidieron los datos',
      field: 'contacts',
    },
    {
      icon: 'favorites',
      label: 'Favoritos',
      hint: 'Personas que lo guardaron',
      field: 'favorites',
    },
  ] as const;
  return (
    <PdfSection title="Estadísticas en los portales">
      {report.publications.map((publication, index) => {
        const logo = portalLogo(publication.portal);
        const operation = publicationPrices(prices, publication.operation);
        return (
          <View key={index} style={styles.portal} wrap={false}>
            <View style={styles.portalHead}>
              {logo === undefined ? null : <Image src={logo} style={styles.portalLogo} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.portalName}>{portalName(publication.portal)}</Text>
                {operation === '' ? null : <Text style={styles.cellHint}>{operation}</Text>}
              </View>
              {publication.status === 'published' ? null : (
                <Text style={styles.pill}>
                  {(
                    PUBLICATION_STATUS_LABELS[publication.status] ?? publication.status
                  ).toUpperCase()}
                </Text>
              )}
            </View>
            <View style={styles.table}>
              <View style={styles.headRow}>
                <View style={styles.labelCell}>
                  <Text style={styles.head}>Desempeño del aviso</Text>
                </View>
                <View style={styles.numberCell}>
                  <Text style={[styles.head, { textAlign: 'right' }]}>En el período</Text>
                </View>
              </View>
              {rows.map((row) => (
                <View key={row.field} style={styles.row}>
                  <RowLabel icon={row.icon} label={row.label} hint={row.hint} />
                  <NumberCell value={publication[row.field]} />
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </PdfSection>
  );
}

function LinkOut({ href, children }: { readonly href: string; readonly children: ReactNode }) {
  return (
    <Link src={href} style={styles.link}>
      {children}
    </Link>
  );
}

/** Dónde está publicada hoy: el sitio web y cada aviso activo, con su link. */
function ActivePublications({ prepared }: { readonly prepared: Prepared }): ReactElement {
  const { report, prices, webUrl, company } = prepared.content;
  const active = report.publications.filter((publication) => publication.status === 'published');
  return (
    <PdfSection title="Publicaciones activas">
      {webUrl === undefined ? null : (
        <View style={styles.publication} wrap={false}>
          {prepared.logo === undefined ? (
            <Text style={[styles.portalName, { width: PORTAL_LOGO.width }]}>{company.name}</Text>
          ) : (
            <Image src={logoSrc(prepared.logo)} style={styles.portalLogo} />
          )}
          <Text style={styles.publicationText}>
            Sitio web · {publicationPrices(prices, undefined)}
          </Text>
          <LinkOut href={webUrl}>Ver en la web</LinkOut>
        </View>
      )}
      {active.map((publication, index) => {
        const logo = portalLogo(publication.portal);
        return (
          <View key={index} style={styles.publication} wrap={false}>
            {logo === undefined ? (
              <Text style={[styles.portalName, { width: PORTAL_LOGO.width }]}>
                {portalName(publication.portal)}
              </Text>
            ) : (
              <Image src={logo} style={styles.portalLogo} />
            )}
            <Text style={styles.publicationText}>
              {publication.portal === 'mercadolibre_developments' ? 'Emprendimientos · ' : ''}
              {publicationPrices(prices, publication.operation)}
            </Text>
            {publication.permalink === undefined ? null : (
              <LinkOut href={publication.permalink}>Ir a la publicación</LinkOut>
            )}
          </View>
        );
      })}
      {webUrl === undefined && active.length === 0 ? (
        <Text style={styles.muted}>Hoy no está publicada en la web ni en los portales.</Text>
      ) : null}
    </PdfSection>
  );
}

function contactLines(contact: DocumentContact): string[] {
  const text = contactTextLines(contact);
  if (text !== undefined) return text;
  return [
    contact.address,
    contact.phone === undefined ? undefined : `Tel. ${formatPhone(contact.phone)}`,
    contact.whatsapp === undefined ? undefined : `WhatsApp ${formatPhone(contact.whatsapp)}`,
    contact.email,
  ].filter((line): line is string => line !== undefined && line !== '');
}

/** "Tu productor" y la empresa, como cierre. */
function Footer({ prepared }: { readonly prepared: Prepared }): ReactElement | null {
  const { producer, contact, company } = prepared.content;
  if (producer === undefined && contact === undefined && prepared.logo === undefined) return null;
  return (
    <View style={styles.footer} wrap={false}>
      {producer === undefined ? null : (
        <View style={styles.producer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(producer.name)}</Text>
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={styles.footerLabel}>TU PRODUCTOR</Text>
            <Text style={styles.footerName}>{producer.name}</Text>
            {[producer.whatsapp ?? producer.phone, producer.email]
              .filter((line) => line !== undefined)
              .map((line) => (
                <Text key={line} style={styles.cellHint}>
                  {line.startsWith('+') ? formatPhone(line) : line}
                </Text>
              ))}
          </View>
        </View>
      )}
      <View style={styles.company}>
        {prepared.logo === undefined ? (
          <Text style={styles.footerName}>{company.name}</Text>
        ) : (
          <Image src={logoSrc(prepared.logo)} style={styles.companyLogo} />
        )}
        {contact === undefined
          ? null
          : [contact.name, ...contactLines(contact)].map((line) => (
              <Text key={line} style={styles.cellHint}>
                {line}
              </Text>
            ))}
      </View>
    </View>
  );
}

/** El reporte al propietario con react-pdf (ADR 0051). */
export class ReactPdfOwnerReportRenderer implements OwnerReportRenderer {
  async render(content: OwnerReportContent): Promise<Uint8Array> {
    const prepared: Prepared = {
      content,
      photo: content.photo === undefined ? undefined : await photoJpeg(content.photo, PHOTO),
      logo: await logoPng(content.company.logo),
    };
    const branding: PdfBranding = {
      logo: prepared.logo,
      companyName: content.company.name,
      contactLine: contactLine(content.contact),
    };
    const { options } = content;
    return renderPdf(
      <PdfDocument
        meta={{
          title: `Reporte al propietario ${content.property.code}`,
          author: content.company.name,
        }}
      >
        <PdfPage
          branding={branding}
          footerNote="Los números de cada portal son los que informa el portal."
        >
          <Text style={styles.title}>Reporte al propietario</Text>
          <Text style={styles.subtitle}>
            GENERADO EL {generatedFormat.format(content.generatedAt)}
          </Text>
          <PropertyCard prepared={prepared} />
          <Comparison prepared={prepared} />
          <Period prepared={prepared} />
          {options.statistics ? <PortalStatistics prepared={prepared} /> : null}
          {options.publications ? <ActivePublications prepared={prepared} /> : null}
          <Footer prepared={prepared} />
        </PdfPage>
      </PdfDocument>,
    );
  }
}
