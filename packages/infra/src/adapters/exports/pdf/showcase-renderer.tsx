import type {
  DocumentContact,
  PdfPrice,
  ShowcaseContent,
  ShowcaseRenderer,
} from '@norde/core/properties';
import { Image, Page, StyleSheet, Text, View, type DocumentProps } from '@react-pdf/renderer';
import type { ReactElement } from 'react';

import { formatMoney, formatPhone, paragraphs } from './format';
import { PdfIcon, type PdfIconName } from './icons';
import { logoPng, photoJpeg } from './images';
import { PdfDocument, PdfPhoto } from './kit';
import {
  amount,
  contactTextLines,
  keyFacts,
  kindLabel,
  LEGAL_NOTE,
  operationLabel,
} from './property-text';
import { PdfQr } from './qr';
import { renderPdf } from './render';
import { PDF_COLORS, PDF_FONT } from './theme';

// El PDF de vidriera (#175, etapa 2): una sola hoja para pegar en la vidriera de la sucursal, que
// se lee de lejos. Mejora el de Tokko:
// - la operación va en una banda del color principal sobre la foto, no casi invisible;
// - suma m², ambientes, dormitorios, baños y cocheras con íconos, y el contacto en texto;
// - la descripción nunca se corta a mitad de línea: la letra arranca en el tamaño elegido y baja
//   hasta que todo entra en la hoja; recién al mínimo se recorta en una palabra, con "…".
// El ajuste se mide con el propio react-pdf: se arma la hoja y, si ocupa más de una página, se
// vuelve a armar con la letra más chica.

const MARGIN = 28;
/** El tamaño de Tokko (30 a 50) en puntos: 30 → 12 pt, 50 → 20 pt. */
const POINTS_PER_TOKKO_SIZE = 0.4;
/** Lo más chica que puede quedar la descripción: debajo de esto no se lee en una vidriera. */
const MIN_DESCRIPTION_PT = 9;
const GAP = 4;

/** Los recuadros de las fotos: la principal y las dos chicas, según la orientación. */
const PHOTOS = {
  portrait: {
    single: { width: 539, height: 300 },
    hero: { width: 359, height: 262 },
    small: { width: 176, height: 129 },
  },
  // A lo alto entran la cabecera, las fotos y la franja de contacto: 360 puntos de fotos.
  landscape: {
    single: { width: 420, height: 360 },
    hero: { width: 420, height: 232 },
    small: { width: 208, height: 124 },
  },
} as const;

type Orientation = ShowcaseContent['options']['orientation'];
interface Box {
  readonly width: number;
  readonly height: number;
}

// ---------- Colores ----------

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** El texto sobre un fondo de color: blanco o tinta, el que más se lea. */
function textOn(background: string): string {
  return contrast(background, PDF_COLORS.paper) >= contrast(background, PDF_COLORS.ink)
    ? PDF_COLORS.paper
    : PDF_COLORS.ink;
}

/** El color elegido para texto sobre blanco; si es muy claro para leerse, la tinta. */
function inkOr(color: string): string {
  return contrast(color, PDF_COLORS.paper) >= 3 ? color : PDF_COLORS.ink;
}

interface Palette {
  readonly primary: string;
  readonly onPrimary: string;
  /** El principal como texto o ícono sobre blanco. */
  readonly accent: string;
  readonly secondary: string;
  readonly onSecondary: string;
}

function palette(options: ShowcaseContent['options']): Palette {
  return {
    primary: options.primaryColor,
    onPrimary: textOn(options.primaryColor),
    accent: inkOr(options.primaryColor),
    secondary: options.secondaryColor,
    onSecondary: textOn(options.secondaryColor),
  };
}

// ---------- Lo que se imprime ----------

/** "VENTA · ALQUILER". */
function operations(prices: readonly PdfPrice[]): string {
  return [...new Set(prices.map((price) => operationLabel(price).toUpperCase()))].join(' · ');
}

/** "Casa en venta y alquiler". */
function eyebrow(content: ShowcaseContent): string {
  const names = [...new Set(content.prices.map((price) => operationLabel(price).toLowerCase()))];
  const joined =
    names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} y ${names.at(-1) ?? ''}`;
  return [kindLabel(content.property.propertyType), joined === '' ? '' : `en ${joined}`]
    .filter((part) => part !== '')
    .join(' ');
}

/** Lo que suma a la operación, en la banda: crédito, permuta, financiación. */
function highlights(content: ShowcaseContent): string[] {
  const { deal } = content.property;
  return [
    deal.creditEligible ? 'Apto crédito' : undefined,
    deal.acceptsSwap ? 'Acepta permuta' : undefined,
    deal.hasFinancing ? 'Financiación' : undefined,
  ].filter((part): part is string => part !== undefined);
}

function pricePerM2(content: ShowcaseContent, price: PdfPrice): string | undefined {
  if (price.priceCents === undefined) return undefined;
  const perM2 = content.property.operations.find(
    (candidate) => candidate.operation === price.operation && candidate.currency === price.currency,
  )?.pricePerM2Cents;
  return perM2 === undefined ? undefined : `${formatMoney(price.currency, perM2)} / m²`;
}

// ---------- Ajuste de la descripción ----------

export interface DescriptionFit {
  readonly size: number;
  readonly paragraphs: readonly string[];
}

/** Las primeras `words` palabras de la descripción, con "…" al final si se recortó. */
export function firstWords(text: readonly string[], words: number): string[] {
  const kept: string[] = [];
  let left = words;
  for (const paragraph of text) {
    if (left <= 0) break;
    const tokens = paragraph.split(/\s+/).filter((token) => token !== '');
    kept.push(tokens.length <= left ? paragraph : tokens.slice(0, left).join(' '));
    left -= tokens.length;
  }
  // Se cortó (en medio de un párrafo o entre dos): que se note.
  const last = kept.pop();
  if (last === undefined) return kept;
  const truncated = kept.length + 1 < text.length || left < 0;
  return [...kept, truncated ? `${last.replace(/[.,;:]$/, '')}…` : last];
}

/** Cuántas páginas tiene un PDF de react-pdf (cada página es un objeto `/Type /Page`). */
export function pageCount(pdf: Uint8Array): number {
  return (
    Buffer.from(pdf)
      .toString('latin1')
      .match(/\/Type\s*\/Page\b(?!s)/g)?.length ?? 0
  );
}

/**
 * Arma la hoja con la letra más grande que entre, entre el tamaño elegido y el mínimo. Si ni al
 * mínimo entra, recorta la descripción en la palabra justa. Cada intento es una búsqueda binaria:
 * pocas vueltas aunque la descripción sea larga.
 */
async function fitted(
  description: readonly string[],
  maxSize: number,
  build: (fit: DescriptionFit) => ReactElement<DocumentProps>,
  brandColor: string,
): Promise<Uint8Array> {
  const attempt = async (fit: DescriptionFit) => {
    const pdf = await renderPdf(build(fit), { brandColor });
    return { pdf, fits: pageCount(pdf) <= 1 };
  };
  const full = await attempt({ size: maxSize, paragraphs: description });
  if (full.fits || description.length === 0) return full.pdf;

  // Tamaños de medio punto entre el mínimo y el elegido.
  const sizes: number[] = [];
  for (let size = MIN_DESCRIPTION_PT; size < maxSize; size += 0.5) sizes.push(size);
  let best: Uint8Array | undefined;
  let [low, high] = [0, sizes.length - 1];
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const size = sizes[middle] ?? MIN_DESCRIPTION_PT;
    const result = await attempt({ size, paragraphs: description });
    if (result.fits) {
      best = result.pdf;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (best !== undefined) return best;

  // Ni al mínimo: la mayor cantidad de palabras que entra.
  const total = description.join(' ').split(/\s+/).length;
  let trimmed = (await attempt({ size: MIN_DESCRIPTION_PT, paragraphs: [] })).pdf;
  [low, high] = [1, total - 1];
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const result = await attempt({
      size: MIN_DESCRIPTION_PT,
      paragraphs: firstWords(description, middle),
    });
    if (result.fits) {
      trimmed = result.pdf;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return trimmed;
}

// ---------- Piezas ----------

const styles = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT,
    fontSize: 9,
    color: PDF_COLORS.ink,
    backgroundColor: PDF_COLORS.paper,
    padding: MARGIN,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 16,
  },
  logo: { height: 44, maxWidth: 200, objectFit: 'contain', objectPosition: 'left' },
  companyName: { fontSize: 18, lineHeight: 1.1, fontWeight: 800 },
  qr: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qrCaption: {
    fontSize: 7.5,
    lineHeight: 1.3,
    color: PDF_COLORS.muted,
    textAlign: 'right',
    width: 70,
  },
  photos: { flexDirection: 'row', gap: GAP },
  photoColumn: { gap: GAP },
  heroWrap: { position: 'relative' },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  bandText: { fontSize: 17, lineHeight: 1, fontWeight: 800, letterSpacing: 2 },
  bandExtra: { fontSize: 8.5, lineHeight: 1, fontWeight: 600, letterSpacing: 0.4 },
  placeholder: { backgroundColor: PDF_COLORS.sand, alignItems: 'center', justifyContent: 'center' },
  placeholderLogo: { width: 220, height: 80, objectFit: 'contain', opacity: 0.5 },
  placeholderText: { fontSize: 20, lineHeight: 1.1, fontWeight: 800, color: PDF_COLORS.rule },
  eyebrow: { fontSize: 9, lineHeight: 1.2, fontWeight: 800, letterSpacing: 1 },
  title: {
    fontSize: 22,
    lineHeight: 1.15,
    fontWeight: 800,
    marginTop: 3,
    maxLines: 2,
    textOverflow: 'ellipsis',
  },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  address: { fontSize: 10.5, lineHeight: 1.3, color: PDF_COLORS.muted },
  facts: { flexDirection: 'row', gap: 6, marginTop: 10 },
  fact: {
    flexGrow: 1,
    flexBasis: 0,
    backgroundColor: PDF_COLORS.sand,
    alignItems: 'center',
    paddingVertical: 7,
    gap: 3,
  },
  factText: { fontSize: 11, lineHeight: 1.1, fontWeight: 800, textAlign: 'center' },
  // La descripción ocupa lo que sobra y no se encoge: si no entra, la hoja pasa a dos páginas y el
  // ajuste lo detecta.
  description: { flexGrow: 1, flexShrink: 0, marginTop: 10 },
  prices: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 8,
  },
  price: { gap: 2 },
  priceLabel: { fontSize: 8.5, lineHeight: 1.1, fontWeight: 800, letterSpacing: 1 },
  priceAmount: { fontSize: 30, lineHeight: 1, fontWeight: 800 },
  priceAmountSmall: { fontSize: 22, lineHeight: 1, fontWeight: 800 },
  perM2: { fontSize: 9, lineHeight: 1.2, color: PDF_COLORS.muted },
  contact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  contactMain: { flex: 1, gap: 3 },
  contactLabel: { fontSize: 7.5, lineHeight: 1.1, fontWeight: 800, letterSpacing: 1 },
  contactBig: { fontSize: 17, lineHeight: 1.1, fontWeight: 800 },
  contactLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  contactSmall: { fontSize: 8, lineHeight: 1.3 },
  agent: { maxWidth: 190, gap: 2 },
  legal: { fontSize: 6, lineHeight: 1.3, color: PDF_COLORS.muted, marginTop: 5 },
  columns: { flexDirection: 'row', gap: 20, flexGrow: 1 },
  aside: { flex: 1, flexDirection: 'column' },
});

interface Prepared {
  readonly content: ShowcaseContent;
  readonly photos: readonly Uint8Array[];
  readonly logo: Uint8Array | undefined;
  readonly colors: Palette;
}

/** Las cajas de las fotos según cuántas hay: una sola grande, o la principal y las chicas. */
function photoBoxes(orientation: Orientation, total: number): Box[] {
  const sizes = PHOTOS[orientation];
  if (total <= 1) return [sizes.single];
  if (total === 2) {
    return orientation === 'portrait'
      ? [sizes.hero, { width: sizes.small.width, height: sizes.hero.height }]
      : [sizes.hero, { width: sizes.hero.width, height: sizes.small.height }];
  }
  return [sizes.hero, sizes.small, sizes.small];
}

/** Como data URI: el PDF guarda el logo una sola vez aunque aparezca dos veces. */
function logoSrc(logo: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(logo).toString('base64')}`;
}

function Header({ prepared }: { readonly prepared: Prepared }): ReactElement {
  const { content, logo } = prepared;
  return (
    <View style={styles.header}>
      {logo === undefined ? (
        <Text style={styles.companyName}>{content.company.name}</Text>
      ) : (
        <Image src={logoSrc(logo)} style={styles.logo} />
      )}
      {content.qrUrl === undefined ? null : (
        <View style={styles.qr}>
          <Text style={styles.qrCaption}>Escaneá y mirá todas las fotos</Text>
          <PdfQr url={content.qrUrl} size={60} />
        </View>
      )}
    </View>
  );
}

function Band({ prepared }: { readonly prepared: Prepared }): ReactElement | null {
  const { content, colors } = prepared;
  const text = operations(content.prices);
  if (!content.options.operationBand || text === '') return null;
  return (
    <View style={[styles.band, { backgroundColor: colors.primary }]}>
      <Text style={[styles.bandText, { color: colors.onPrimary }]}>{text}</Text>
      <Text style={[styles.bandExtra, { color: colors.onPrimary }]}>
        {highlights(content).join(' · ').toUpperCase()}
      </Text>
    </View>
  );
}

function Photos({ prepared }: { readonly prepared: Prepared }): ReactElement {
  const { content, photos } = prepared;
  const { orientation } = content.options;
  const boxes = photoBoxes(orientation, photos.length);
  const [heroBox = PHOTOS[orientation].single, ...smallBoxes] = boxes;
  const [hero, ...small] = photos;
  const heroView = (
    <View style={styles.heroWrap}>
      {hero === undefined ? (
        // Sin fotos: un recuadro con el logo, para que la hoja no quede vacía.
        <View style={[styles.placeholder, { width: heroBox.width, height: heroBox.height }]}>
          {prepared.logo === undefined ? (
            <Text style={styles.placeholderText}>{content.company.name}</Text>
          ) : (
            <Image src={logoSrc(prepared.logo)} style={styles.placeholderLogo} />
          )}
        </View>
      ) : (
        <PdfPhoto bytes={hero} {...heroBox} />
      )}
      <Band prepared={prepared} />
    </View>
  );
  if (small.length === 0) return heroView;
  const others = (
    <View style={[styles.photoColumn, orientation === 'landscape' ? { flexDirection: 'row' } : {}]}>
      {small.map((bytes, index) => {
        const box = smallBoxes[index] ?? PHOTOS[orientation].small;
        return <PdfPhoto key={index} bytes={bytes} {...box} />;
      })}
    </View>
  );
  return orientation === 'portrait' ? (
    <View style={styles.photos}>
      {heroView}
      {others}
    </View>
  ) : (
    <View style={styles.photoColumn}>
      {heroView}
      {others}
    </View>
  );
}

function Heading({ prepared }: { readonly prepared: Prepared }): ReactElement {
  const { content, colors } = prepared;
  return (
    <View>
      <Text style={[styles.eyebrow, { color: colors.accent }]}>
        {eyebrow(content).toUpperCase()} · REF. {content.property.code}
      </Text>
      <Text style={styles.title}>{content.property.portalTitle}</Text>
      {content.address === '' ? null : (
        <View style={styles.addressRow}>
          <PdfIcon name="location" size={10} color={colors.accent} />
          <Text style={styles.address}>{content.address}</Text>
        </View>
      )}
    </View>
  );
}

function Facts({ prepared }: { readonly prepared: Prepared }): ReactElement | null {
  const facts = keyFacts(prepared.content.property);
  if (facts.length === 0) return null;
  return (
    <View style={styles.facts}>
      {facts.map((fact) => (
        <View key={fact.icon} style={styles.fact}>
          <PdfIcon name={fact.icon} size={15} color={prepared.colors.accent} />
          <Text style={styles.factText}>{fact.text}</Text>
        </View>
      ))}
    </View>
  );
}

function Description({ fit }: { readonly fit: DescriptionFit }): ReactElement {
  const paragraph = { fontSize: fit.size, lineHeight: 1.35, marginBottom: fit.size * 0.45 };
  return (
    <View style={styles.description}>
      {fit.paragraphs.map((text, index) => (
        <Text key={index} style={paragraph}>
          {text}
        </Text>
      ))}
    </View>
  );
}

function Prices({ prepared }: { readonly prepared: Prepared }): ReactElement | null {
  const { content, colors } = prepared;
  const shown = content.prices.slice(0, 2);
  if (shown.length === 0) return null;
  const [only] = shown;
  const perM2 = shown.length === 1 && only !== undefined ? pricePerM2(content, only) : undefined;
  return (
    <View style={styles.prices} wrap={false}>
      {shown.map((price) => (
        <View key={`${price.operation}-${price.currency}`} style={styles.price}>
          <Text style={[styles.priceLabel, { color: colors.accent }]}>
            {operationLabel(price).toUpperCase()}
          </Text>
          <Text
            style={[
              shown.length === 1 ? styles.priceAmount : styles.priceAmountSmall,
              { color: price.priceCents === undefined ? PDF_COLORS.ink : colors.accent },
            ]}
          >
            {amount(price)}
          </Text>
        </View>
      ))}
      {perM2 === undefined ? null : <Text style={styles.perM2}>{perM2}</Text>}
    </View>
  );
}

function ContactLine({
  icon,
  text,
  color,
}: {
  readonly icon: PdfIconName;
  readonly text: string;
  readonly color: string;
}): ReactElement {
  return (
    <View style={styles.contactLine}>
      <PdfIcon name={icon} size={9} color={color} />
      <Text style={[styles.contactSmall, { color }]}>{text}</Text>
    </View>
  );
}

/** El número grande de la franja: el WhatsApp de la sucursal o, si no, su teléfono o el del agente. */
function mainPhone(
  contact: DocumentContact | undefined,
  agent: DocumentContact | undefined,
): { readonly icon: PdfIconName; readonly text: string } | undefined {
  const whatsapp = contact?.whatsapp;
  if (whatsapp !== undefined) return { icon: 'whatsapp', text: formatPhone(whatsapp) };
  const phone = contact?.phone ?? agent?.whatsapp ?? agent?.phone;
  return phone === undefined ? undefined : { icon: 'phone', text: formatPhone(phone) };
}

function Contact({ prepared }: { readonly prepared: Prepared }): ReactElement {
  const { content, colors } = prepared;
  const { contact, agent } = content;
  const color = colors.onSecondary;
  // El texto libre reemplaza a los datos de la sucursal: el número grande, si hay, es el del agente.
  const text = contactTextLines(contact);
  const big = mainPhone(text === undefined ? contact : undefined, agent);
  const details = [
    contact?.phone !== undefined && contact.whatsapp !== undefined
      ? { icon: 'phone' as const, text: `Tel. ${formatPhone(contact.phone)}` }
      : undefined,
    contact?.email === undefined ? undefined : { icon: 'email' as const, text: contact.email },
    contact?.address === undefined
      ? undefined
      : { icon: 'location' as const, text: contact.address },
  ].filter((line) => line !== undefined);
  const agentLines = [agent?.whatsapp ?? agent?.phone, agent?.email].filter(
    (line) => line !== undefined,
  );
  return (
    <View style={[styles.contact, { backgroundColor: colors.secondary }]} wrap={false}>
      <View style={styles.contactMain}>
        <Text style={[styles.contactLabel, { color }]}>CONSULTÁ POR ESTA PROPIEDAD</Text>
        {big === undefined ? null : (
          <View style={styles.contactLine}>
            <PdfIcon name={big.icon} size={16} color={color} />
            <Text style={[styles.contactBig, { color }]}>{big.text}</Text>
          </View>
        )}
        {text === undefined ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 2 }}>
            {details.map((line) => (
              <ContactLine key={line.icon} icon={line.icon} text={line.text} color={color} />
            ))}
          </View>
        ) : (
          text.map((line, index) => (
            <Text key={index} style={[styles.contactSmall, { color }]}>
              {line}
            </Text>
          ))
        )}
      </View>
      {agent === undefined ? null : (
        <View style={styles.agent}>
          <Text style={[styles.contactLabel, { color }]}>TU AGENTE</Text>
          <Text style={[styles.contactSmall, { color, fontWeight: 800, fontSize: 10 }]}>
            {agent.name}
          </Text>
          {agentLines.map((line) => (
            <Text key={line} style={[styles.contactSmall, { color }]}>
              {line.startsWith('+') ? formatPhone(line) : line}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

/** La hoja entera. Se llama como función: el ajuste la arma varias veces con distinta letra. */
function sheet(prepared: Prepared, fit: DescriptionFit): ReactElement<DocumentProps> {
  const { orientation } = prepared.content.options;
  const meta = {
    title: `Vidriera ${prepared.content.property.code}`,
    author: prepared.content.company.name,
  };
  const details = (
    <>
      <Heading prepared={prepared} />
      <Facts prepared={prepared} />
      <Description fit={fit} />
      <Prices prepared={prepared} />
    </>
  );
  return (
    <PdfDocument meta={meta}>
      <Page size="A4" orientation={orientation} style={styles.page}>
        <Header prepared={prepared} />
        {orientation === 'portrait' ? (
          <View style={{ flexGrow: 1, flexDirection: 'column' }}>
            <Photos prepared={prepared} />
            <View style={{ marginTop: 12, flexGrow: 1, flexDirection: 'column' }}>{details}</View>
          </View>
        ) : (
          <View style={styles.columns}>
            <Photos prepared={prepared} />
            <View style={styles.aside}>{details}</View>
          </View>
        )}
        <Contact prepared={prepared} />
        <Text style={styles.legal}>{LEGAL_NOTE}</Text>
      </Page>
    </PdfDocument>
  );
}

/** La vidriera con react-pdf (ADR 0051): una hoja, con la descripción ajustada para que entre. */
export class ReactPdfShowcaseRenderer implements ShowcaseRenderer {
  async render(content: ShowcaseContent): Promise<Uint8Array> {
    const { orientation } = content.options;
    const boxes = photoBoxes(orientation, content.photos.length);
    const photos = await Promise.all(
      content.photos.map((bytes, index) =>
        photoJpeg(bytes, boxes[index] ?? PHOTOS[orientation].small),
      ),
    );
    const prepared: Prepared = {
      content,
      photos: photos.filter((photo): photo is Uint8Array => photo !== undefined),
      logo: await logoPng(content.company.logo),
      colors: palette(content.options),
    };
    return fitted(
      paragraphs(content.property.description),
      content.options.descriptionSize * POINTS_PER_TOKKO_SIZE,
      (fit) => sheet(prepared, fit),
      // La vidriera usa su color principal (el de Mi empresa, si no se eligió otro).
      content.options.primaryColor,
    );
  }
}
