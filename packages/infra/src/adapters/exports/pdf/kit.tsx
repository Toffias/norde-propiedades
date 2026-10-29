import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ReactElement, ReactNode } from 'react';

import { paragraphs } from './format';
import { PdfIcon, type PdfIconName } from './icons';
import { brandColor } from './brand';
import { PDF_COLORS, PDF_FONT, PDF_TYPE } from './theme';

// Las piezas comunes de los PDF (#175): la hoja con cabecera y pie que se repiten en cada página,
// las secciones con título rojo y línea, los pares "Etiqueta: valor", las listas en columnas, el
// precio con su badge de operación, los datos clave con íconos, las fotos y la descripción.
//
// Ojo con react-pdf:
// - `lineHeight` va en cada estilo de texto, con su `fontSize`: sin el `fontSize` el interlineado
//   sale enorme. Heredado de la hoja, o en un texto con `render` (el número de página), ese texto
//   no se dibuja.
// - Un `Svg` dentro de un `Text` no se dibuja.

const MARGIN = 30;
const HEADER_SPACE = 64;
const FOOTER_SPACE = 40;

const styles = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT,
    fontSize: PDF_TYPE.body,
    color: PDF_COLORS.ink,
    backgroundColor: PDF_COLORS.paper,
    paddingTop: HEADER_SPACE,
    paddingBottom: FOOTER_SPACE,
    paddingHorizontal: MARGIN,
  },
  header: {
    position: 'absolute',
    top: 20,
    left: MARGIN,
    right: MARGIN,
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 0.6,
    borderBottomColor: PDF_COLORS.rule,
    paddingBottom: 6,
  },
  logo: { height: 30, maxWidth: 160, objectFit: 'contain', objectPosition: 'left' },
  companyName: { fontSize: 13, fontWeight: 800, color: PDF_COLORS.brand },
  headerContact: {
    fontSize: PDF_TYPE.small,
    lineHeight: 1.35,
    color: PDF_COLORS.muted,
    textAlign: 'right',
    maxWidth: '70%',
  },
  footer: {
    position: 'absolute',
    bottom: 14,
    left: MARGIN,
    right: MARGIN,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 16,
    borderTopWidth: 0.6,
    borderTopColor: PDF_COLORS.rule,
    paddingTop: 5,
  },
  footerNote: { flex: 1, fontSize: PDF_TYPE.caption, lineHeight: 1.3, color: PDF_COLORS.muted },
  // Ancho fijo y sin `lineHeight`: el texto se calcula recién en la última pasada.
  pageNumber: {
    width: 80,
    textAlign: 'right',
    fontSize: PDF_TYPE.caption,
    color: PDF_COLORS.muted,
  },
  sectionTitle: {
    fontSize: PDF_TYPE.body,
    lineHeight: 1.2,
    fontWeight: 800,
    letterSpacing: 0.8,
    color: PDF_COLORS.brand,
    marginTop: 10,
    marginBottom: 5,
    paddingBottom: 3,
    borderBottomWidth: 0.6,
    borderBottomColor: PDF_COLORS.rule,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 2 },
  label: { color: PDF_COLORS.muted },
  value: { fontWeight: 600 },
  priceTag: { flexDirection: 'row', alignItems: 'stretch' },
  operation: {
    backgroundColor: PDF_COLORS.brand,
    color: PDF_COLORS.paper,
    fontSize: PDF_TYPE.lead,
    lineHeight: 1,
    fontWeight: 800,
    letterSpacing: 1,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
  },
  amount: {
    borderWidth: 0.8,
    borderLeftWidth: 0,
    borderColor: PDF_COLORS.rule,
    fontSize: 16,
    lineHeight: 1,
    fontWeight: 800,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 4,
  },
  keyFacts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
  keyFact: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  keyFactText: { fontSize: PDF_TYPE.lead, lineHeight: 1.2, fontWeight: 600 },
  paragraph: { fontSize: PDF_TYPE.body, lineHeight: 1.5, marginBottom: 5 },
});

export interface PdfDocumentMeta {
  readonly title: string;
  readonly author: string;
}

/** El documento, con título y autor en los metadatos y el idioma para los lectores de pantalla. */
export function PdfDocument({
  meta,
  children,
}: {
  readonly meta: PdfDocumentMeta;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Document
      title={meta.title}
      author={meta.author}
      creator={meta.author}
      producer={meta.author}
      language="es-AR"
    >
      {children}
    </Document>
  );
}

export interface PdfBranding {
  /** El logo de Mi empresa en PNG (el renderer lo convierte); sin logo, va el nombre. */
  readonly logo: Uint8Array | undefined;
  readonly companyName: string;
  /** La línea de contacto de la cabecera: dirección, teléfonos, web. */
  readonly contactLine: string | undefined;
}

/**
 * Una hoja A4 (vertical u horizontal) con la cabecera y el pie fijos: se repiten en cada página
 * que genera el contenido al no entrar, con "página x de y".
 */
export function PdfPage({
  branding,
  orientation = 'portrait',
  footerNote,
  children,
}: {
  readonly branding: PdfBranding;
  readonly orientation?: 'portrait' | 'landscape';
  readonly footerNote?: string;
  readonly children: ReactNode;
}): ReactElement {
  const brand = brandColor();
  return (
    <Page size="A4" orientation={orientation} style={styles.page}>
      <View style={styles.header} fixed>
        {branding.logo === undefined ? (
          <Text style={[styles.companyName, { color: brand }]}>{branding.companyName}</Text>
        ) : (
          // Como data URI, el PDF lo guarda una sola vez aunque se repita en cada hoja.
          <Image
            src={`data:image/png;base64,${Buffer.from(branding.logo).toString('base64')}`}
            style={styles.logo}
          />
        )}
        {branding.contactLine === undefined ? null : (
          <Text style={styles.headerContact}>{branding.contactLine}</Text>
        )}
      </View>
      {children}
      <View style={styles.footer} fixed>
        <Text style={styles.footerNote}>{footerNote ?? ''}</Text>
        <Text
          style={styles.pageNumber}
          // En la primera pasada react-pdf todavía no sabe el total: no se puede llamar a métodos.
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
        />
      </View>
    </Page>
  );
}

/**
 * Título de sección en rojo con una línea debajo. Con `keepTogether`, la sección entera pasa a la
 * página siguiente si no entra (para bloques cortos); si no, el título nunca queda solo al pie.
 */
export function PdfSection({
  title,
  keepTogether = false,
  children,
}: {
  readonly title: string;
  readonly keepTogether?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  const brand = brandColor();
  return (
    <View wrap={!keepTogether}>
      <Text style={[styles.sectionTitle, { color: brand }]} minPresenceAhead={36}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

/** El título de sección solo, para armarlo junto con el comienzo de su contenido. */
export function PdfSectionTitle({ title }: { readonly title: string }): ReactElement {
  const brand = brandColor();
  return <Text style={[styles.sectionTitle, { color: brand }]}>{title.toUpperCase()}</Text>;
}

export interface PdfField {
  readonly label: string;
  readonly value: string;
}

/** Pares "Etiqueta: valor" en columnas. */
export function PdfFields({
  fields,
  columns = 3,
}: {
  readonly fields: readonly PdfField[];
  readonly columns?: number;
}): ReactElement {
  const width = `${(100 / columns).toFixed(3)}%`;
  return (
    <View style={styles.grid}>
      {fields.map((field) => (
        <Text key={field.label} style={{ width, paddingRight: 6 }}>
          <Text style={styles.label}>{field.label}: </Text>
          <Text style={styles.value}>{field.value}</Text>
        </Text>
      ))}
    </View>
  );
}

/** Una lista simple (servicios, ambientes, adicionales) en columnas. */
export function PdfItems({
  items,
  columns = 3,
}: {
  readonly items: readonly string[];
  readonly columns?: number;
}): ReactElement {
  const width = `${(100 / columns).toFixed(3)}%`;
  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <Text key={item} style={{ width, paddingRight: 6 }}>
          {item}
        </Text>
      ))}
    </View>
  );
}

/** El badge de la operación pegado al precio: "VENTA | USD 370.000". */
export function PdfPriceTag({
  operation,
  amount,
}: {
  readonly operation: string;
  readonly amount: string;
}): ReactElement {
  const brand = brandColor();
  return (
    <View style={styles.priceTag}>
      <Text style={[styles.operation, { backgroundColor: brand }]}>{operation.toUpperCase()}</Text>
      <Text style={styles.amount}>{amount}</Text>
    </View>
  );
}

export interface PdfKeyFact {
  readonly icon: PdfIconName;
  readonly text: string;
}

/** Los datos que más se miran, con su ícono: ambientes, dormitorios, baños, m², cocheras. */
export function PdfKeyFacts({ facts }: { readonly facts: readonly PdfKeyFact[] }): ReactElement {
  return (
    <View style={styles.keyFacts}>
      {facts.map((fact) => (
        <View key={fact.icon} style={styles.keyFact}>
          <PdfIcon name={fact.icon} size={11} />
          <Text style={styles.keyFactText}>{fact.text}</Text>
        </View>
      ))}
    </View>
  );
}

/** Una foto recortada para llenar su recuadro (la imagen llega ya achicada con sharp). */
export function PdfPhoto({
  bytes,
  width,
  height,
}: {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
}): ReactElement {
  return <Image src={Buffer.from(bytes)} style={{ width, height, objectFit: 'cover' }} />;
}

/**
 * Una sección de texto largo (la descripción) en párrafos, con la misma letra de punta a punta.
 * Pasa de página si no entra, pero el título nunca queda solo al pie: va con el primer párrafo.
 */
export function PdfTextSection({
  title,
  text,
}: {
  readonly title: string;
  readonly text: string;
}): ReactElement | null {
  const brand = brandColor();
  const [first, ...rest] = paragraphs(text);
  if (first === undefined) return null;
  return (
    <View>
      <View wrap={false}>
        <Text style={[styles.sectionTitle, { color: brand }]}>{title.toUpperCase()}</Text>
        <Text style={styles.paragraph}>{first}</Text>
      </View>
      {rest.map((paragraph, index) => (
        <Text key={index} style={styles.paragraph} orphans={2} widows={2}>
          {paragraph}
        </Text>
      ))}
    </View>
  );
}
