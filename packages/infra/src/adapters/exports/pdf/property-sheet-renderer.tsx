import type {
  DocumentContact,
  PdfPrice,
  PropertySheet,
  PropertySheetLayout,
  PropertySheetRenderer,
  PropertySheetsContent,
} from '@norde/core/properties';
import { Link, StyleSheet, Text, View } from '@react-pdf/renderer';
import sharp from 'sharp';
import type { ReactElement } from 'react';

import { photoJpeg } from '../pdf-kit';

import { formatAge, formatMeters, formatMoney, formatPhone, formatSquareMeters } from './format';
import { PdfIcon } from './icons';
import { logoPng } from './images';
import {
  amount,
  contactLine,
  keyFacts,
  kindLabel,
  LEGAL_NOTE,
  operationLabel,
} from './property-text';
import {
  PdfDocument,
  PdfFields,
  PdfItems,
  PdfKeyFacts,
  PdfPage,
  PdfPhoto,
  PdfPriceTag,
  PdfSection,
  PdfTextSection,
  type PdfBranding,
  type PdfField,
} from './kit';
import { renderPdf } from './render';
import { PDF_COLORS, PDF_TYPE } from './theme';

// La ficha en PDF en los formatos de Tokko, mejorados (#175):
// - Horizontal: una hoja apaisada por propiedad, los datos a la izquierda y el precio, las fotos y
//   el agente a la derecha. "Con mapa" cambia la segunda foto grande por el mapa.
// - Vertical: la ficha completa en hojas A4, con la portada a todo el ancho, la descripción entera,
//   la ubicación y todas las fotos. "Con mapa" suma la ubicación antes de las fotos.
// - Grilla: una tabla para comparar, agrupada por tipo de propiedad, con foto, precio y los datos
//   que se comparan (no casillas de "sí / no" como la de Tokko).
// Nada se corta: lo que no entra pasa a la hoja siguiente, con la cabecera y el pie repetidos.

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
const CONDITION_LABELS: Readonly<Record<string, string>> = {
  brand_new: 'A estrenar',
  excellent: 'Excelente',
  very_good: 'Muy bueno',
  good: 'Bueno',
  fair: 'Regular',
  to_renovate: 'A reciclar',
};
/** Las listas de la ficha, en el orden en que se leen. */
const FEATURE_GROUPS = [
  ['service', 'Servicios'],
  ['room', 'Ambientes'],
  ['amenity', 'Adicionales'],
] as const;

/** Medidas de cada formato, en puntos. */
const LANDSCAPE = { aside: 372, gap: 4, big: { width: 184, height: 128 } } as const;
const LANDSCAPE_SMALL = { width: (LANDSCAPE.aside - LANDSCAPE.gap * 2) / 3, height: 82 };
const PORTRAIT = {
  hero: { width: 535, height: 280 },
  photo: { width: 263.5, height: 176 },
  map: { width: 535, height: 220 },
} as const;
const GRID_THUMB = { width: 64, height: 44 } as const;

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
  main: { flex: 1 },
  aside: { width: LANDSCAPE.aside },
  eyebrow: {
    fontSize: PDF_TYPE.small,
    lineHeight: 1.3,
    color: PDF_COLORS.muted,
    letterSpacing: 0.6,
  },
  title: { fontSize: PDF_TYPE.title, lineHeight: 1.15, fontWeight: 800, marginTop: 2 },
  address: { fontSize: PDF_TYPE.lead, lineHeight: 1.3, color: PDF_COLORS.muted, marginTop: 2 },
  prices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  facts: { marginTop: 8 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: LANDSCAPE.gap, marginTop: 8 },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  agent: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  agentBadge: {
    backgroundColor: PDF_COLORS.brand,
    color: PDF_COLORS.paper,
    fontSize: 6.5,
    lineHeight: 1,
    fontWeight: 800,
    letterSpacing: 0.6,
    paddingHorizontal: 6,
    paddingTop: 4,
    paddingBottom: 3,
  },
  agentLine: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  agentText: { fontSize: PDF_TYPE.body, lineHeight: 1.3 },
  agentName: { fontSize: PDF_TYPE.body, lineHeight: 1.3, fontWeight: 600 },
  web: { fontSize: PDF_TYPE.small, lineHeight: 1.3, color: PDF_COLORS.muted, marginTop: 6 },
  webLink: { color: PDF_COLORS.brand, textDecoration: 'none' },
  // Grilla
  groupRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.6,
    borderBottomColor: PDF_COLORS.rule,
    paddingTop: 10,
    paddingBottom: 3,
  },
  groupTitle: {
    fontSize: PDF_TYPE.body,
    lineHeight: 1.2,
    fontWeight: 800,
    letterSpacing: 0.8,
    color: PDF_COLORS.brand,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 0.6,
    borderBottomColor: PDF_COLORS.rule,
    paddingVertical: 4,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: PDF_COLORS.sand,
    paddingVertical: 4,
  },
  head: {
    fontSize: PDF_TYPE.caption,
    lineHeight: 1.2,
    fontWeight: 800,
    color: PDF_COLORS.muted,
    letterSpacing: 0.4,
    paddingHorizontal: 4,
  },
  cell: { fontSize: PDF_TYPE.small, lineHeight: 1.3, paddingHorizontal: 4 },
  cellStrong: { fontSize: PDF_TYPE.small, lineHeight: 1.3, fontWeight: 600 },
  cellMuted: { fontSize: PDF_TYPE.caption, lineHeight: 1.3, color: PDF_COLORS.muted },
  thumbCell: { width: GRID_THUMB.width + 8, paddingHorizontal: 4 },
  thumbEmpty: {
    width: GRID_THUMB.width,
    height: GRID_THUMB.height,
    backgroundColor: PDF_COLORS.sand,
  },
});

// ---------- Lo que se imprime ----------

type Detail = PropertySheet['property'];

function field(label: string, value: string | undefined): PdfField | undefined {
  return value === undefined ? undefined : { label, value };
}

function present(fields: readonly (PdfField | undefined)[]): PdfField[] {
  return fields.filter((entry): entry is PdfField => entry !== undefined);
}

function count(value: number | undefined): string | undefined {
  return value === undefined ? undefined : value.toString();
}

/** Lo que suma a la operación: crédito, permuta, financiación, expensas. */
function dealFields(property: Detail): PdfField[] {
  const { deal } = property;
  return present([
    deal.creditEligible ? { label: 'Crédito', value: 'Apto crédito' } : undefined,
    deal.acceptsSwap ? { label: 'Permuta', value: 'Acepta' } : undefined,
    deal.hasFinancing ? { label: 'Financiación', value: 'Sí' } : undefined,
    deal.immediateDeed ? { label: 'Escritura', value: 'Inmediata' } : undefined,
    field(
      'Expensas',
      deal.expensesCents === undefined ? undefined : formatMoney('ARS', deal.expensesCents),
    ),
  ]);
}

function generalFields(property: Detail): PdfField[] {
  const c = property.characteristics;
  return present([
    field('Ambientes', count(c.rooms)),
    field('Dormitorios', count(c.bedrooms)),
    field('Baños', count(c.bathrooms)),
    field('Toilettes', count(c.toilets)),
    field('Cocheras', count(c.parkingSpaces)),
    field('Antigüedad', c.ageYears === undefined ? undefined : formatAge(c.ageYears)),
    field(
      'Orientación',
      c.orientation === undefined
        ? undefined
        : (ORIENTATION_LABELS[c.orientation] ?? c.orientation),
    ),
    field(
      'Disposición',
      c.disposition === undefined
        ? undefined
        : (DISPOSITION_LABELS[c.disposition] ?? c.disposition),
    ),
    field(
      'Estado',
      c.condition === undefined ? undefined : (CONDITION_LABELS[c.condition] ?? c.condition),
    ),
    c.isFurnished ? { label: 'Amoblado', value: 'Sí' } : undefined,
    c.professionalUse ? { label: 'Apto profesional', value: 'Sí' } : undefined,
  ]);
}

function surfaceFields(property: Detail): PdfField[] {
  const c = property.characteristics;
  const m2 = (value: number | undefined) =>
    value === undefined ? undefined : formatSquareMeters(value);
  return present([
    field('Total construido', m2(c.surfaceTotalM2)),
    field('Cubierta', m2(c.surfaceCoveredM2)),
    field('Semicubierta', m2(c.surfaceSemiCoveredM2)),
    field('Terreno', m2(c.surfaceLandM2)),
    field('Frente', c.frontM === undefined ? undefined : formatMeters(c.frontM)),
    field('Fondo', c.depthM === undefined ? undefined : formatMeters(c.depthM)),
  ]);
}

function featureGroups(property: Detail): (readonly [string, string[]])[] {
  return FEATURE_GROUPS.flatMap(([kind, title]) => {
    const names = property.features
      .filter((feature) => feature.kind === kind)
      .map((feature) => feature.name);
    return names.length === 0 ? [] : [[title, names] as const];
  });
}

// ---------- Fotos ----------

interface PreparedSheet {
  readonly sheet: Omit<PropertySheet, 'photos' | 'map'>;
  readonly photos: readonly Uint8Array[];
  readonly map: Uint8Array | undefined;
}

/** El mapa recortado al centro (el marcador queda en el medio), en JPEG. */
async function mapJpeg(
  bytes: Uint8Array,
  box: { readonly width: number; readonly height: number },
): Promise<Uint8Array | undefined> {
  try {
    const jpeg = await sharp(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))
      .resize({
        width: Math.round(box.width * 2.4),
        height: Math.round(box.height * 2.4),
        fit: 'cover',
        position: 'centre',
      })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    return new Uint8Array(jpeg);
  } catch {
    // Un mapa que no se puede leer: la ficha sale con una foto en su lugar.
    return undefined;
  }
}

/** Los recuadros de cada foto según el formato (la primera, la portada). */
function photoBoxes(layout: PropertySheetLayout, total: number) {
  switch (layout) {
    case 'landscape':
    case 'landscape_map':
      return Array.from({ length: total }, (_, index) =>
        index < (layout === 'landscape' ? 2 : 1) ? LANDSCAPE.big : LANDSCAPE_SMALL,
      );
    case 'portrait':
    case 'portrait_map':
      return Array.from({ length: total }, (_, index) =>
        index === 0 ? PORTRAIT.hero : PORTRAIT.photo,
      );
    case 'grid':
      return Array.from({ length: Math.min(total, 1) }, () => GRID_THUMB);
  }
}

/** Achica y recorta las fotos (y el mapa) al recuadro donde van: el PDF no carga los originales. */
async function prepare(sheet: PropertySheet, layout: PropertySheetLayout): Promise<PreparedSheet> {
  const boxes = photoBoxes(layout, sheet.photos.length);
  const photos = await Promise.all(
    boxes.map((box, index) => {
      const bytes = sheet.photos[index];
      return bytes === undefined ? Promise.resolve(undefined) : photoJpeg(bytes, box);
    }),
  );
  const mapBox = layout === 'landscape_map' ? LANDSCAPE.big : PORTRAIT.map;
  const map = sheet.map === undefined ? undefined : await mapJpeg(sheet.map, mapBox);
  const { photos: _photos, map: _map, ...rest } = sheet;
  return {
    sheet: rest,
    photos: photos.filter((photo): photo is Uint8Array => photo !== undefined),
    map,
  };
}

// ---------- Piezas ----------

function Heading({ sheet }: { readonly sheet: PreparedSheet['sheet'] }): ReactElement {
  const { property } = sheet;
  return (
    <View>
      <Text style={styles.eyebrow}>
        {property.code} · {kindLabel(property.propertyType).toUpperCase()}
      </Text>
      <Text style={styles.title}>{property.portalTitle}</Text>
      {sheet.address === '' ? null : <Text style={styles.address}>{sheet.address}</Text>}
    </View>
  );
}

function Prices({ prices }: { readonly prices: readonly PdfPrice[] }): ReactElement | null {
  if (prices.length === 0) return null;
  return (
    <View style={styles.prices}>
      {prices.map((price) => (
        <PdfPriceTag
          key={`${price.operation}-${price.currency}`}
          operation={operationLabel(price)}
          amount={amount(price)}
        />
      ))}
    </View>
  );
}

function Agent({ agent }: { readonly agent: DocumentContact | undefined }): ReactElement | null {
  if (agent === undefined) return null;
  return (
    <View style={styles.agent} wrap={false}>
      <Text style={styles.agentBadge}>AGENTE A CARGO</Text>
      <View style={styles.agentLine}>
        <PdfIcon name="agent" size={9} />
        <Text style={styles.agentName}>{agent.name}</Text>
      </View>
      {agent.phone === undefined ? null : (
        <View style={styles.agentLine}>
          <PdfIcon name="phone" size={9} />
          <Text style={styles.agentText}>{formatPhone(agent.phone)}</Text>
        </View>
      )}
      {agent.email === undefined ? null : (
        <View style={styles.agentLine}>
          <PdfIcon name="email" size={9} />
          <Text style={styles.agentText}>{agent.email}</Text>
        </View>
      )}
    </View>
  );
}

function WebLink({ url }: { readonly url: string | undefined }): ReactElement | null {
  if (url === undefined) return null;
  return (
    <Text style={styles.web}>
      Más fotos y datos en{' '}
      <Link src={url} style={styles.webLink}>
        {url}
      </Link>
    </Text>
  );
}

/** Operación, información general, superficies, listas y descripción: lo que se lee. */
function Details({
  property,
  listColumns,
}: {
  readonly property: Detail;
  readonly listColumns: number;
}): ReactElement {
  const deal = dealFields(property);
  const general = generalFields(property);
  const surfaces = surfaceFields(property);
  return (
    <View>
      {deal.length === 0 ? null : (
        <PdfSection title="Operación" keepTogether>
          <PdfFields fields={deal} columns={listColumns} />
        </PdfSection>
      )}
      {general.length === 0 ? null : (
        <PdfSection title="Información general" keepTogether>
          <PdfFields fields={general} columns={listColumns} />
        </PdfSection>
      )}
      {surfaces.length === 0 ? null : (
        <PdfSection title="Superficies y medidas" keepTogether>
          <PdfFields fields={surfaces} columns={listColumns} />
        </PdfSection>
      )}
      {featureGroups(property).map(([title, names]) => (
        <PdfSection key={title} title={title} keepTogether>
          <PdfItems items={names} columns={listColumns} />
        </PdfSection>
      ))}
      <PdfTextSection title="Descripción" text={property.description} />
    </View>
  );
}

// ---------- Formatos ----------

function LandscapeSheet({
  prepared,
  layout,
  agent,
}: {
  readonly prepared: PreparedSheet;
  readonly layout: 'landscape' | 'landscape_map';
  readonly agent: DocumentContact | undefined;
}): ReactElement {
  const { sheet, photos, map } = prepared;
  // Con mapa, el mapa ocupa el lugar de la segunda foto grande.
  const big = map === undefined ? photos.slice(0, 2) : photos.slice(0, 1);
  const small = photos.slice(big.length, big.length + 6);
  return (
    <View style={styles.columns}>
      <View style={styles.main}>
        <Heading sheet={sheet} />
        <View style={styles.facts}>
          <PdfKeyFacts facts={keyFacts(sheet.property)} />
        </View>
        <Details property={sheet.property} listColumns={3} />
      </View>
      <View style={styles.aside}>
        <Prices prices={sheet.prices} />
        <View style={styles.photos}>
          {big.map((bytes, index) => (
            <PdfPhoto key={`big-${index.toString()}`} bytes={bytes} {...LANDSCAPE.big} />
          ))}
          {layout === 'landscape_map' && map !== undefined ? (
            <PdfPhoto bytes={map} {...LANDSCAPE.big} />
          ) : null}
          {small.map((bytes, index) => (
            <PdfPhoto key={`small-${index.toString()}`} bytes={bytes} {...LANDSCAPE_SMALL} />
          ))}
        </View>
        <Agent agent={agent} />
        <WebLink url={sheet.webUrl} />
      </View>
    </View>
  );
}

function PortraitSheet({
  prepared,
  agent,
}: {
  readonly prepared: PreparedSheet;
  readonly agent: DocumentContact | undefined;
}): ReactElement {
  const { sheet, photos, map } = prepared;
  const [hero, ...gallery] = photos;
  return (
    <View>
      <Heading sheet={sheet} />
      <View style={{ marginTop: 8 }}>
        <Prices prices={sheet.prices} />
      </View>
      {hero === undefined ? null : (
        <View style={{ marginTop: 10 }}>
          <PdfPhoto bytes={hero} {...PORTRAIT.hero} />
        </View>
      )}
      <View style={styles.facts}>
        <PdfKeyFacts facts={keyFacts(sheet.property)} />
      </View>
      <Details property={sheet.property} listColumns={3} />
      <Agent agent={agent} />
      <WebLink url={sheet.webUrl} />
      {map === undefined ? null : (
        <PdfSection title="Ubicación" keepTogether>
          <PdfPhoto bytes={map} {...PORTRAIT.map} />
        </PdfSection>
      )}
      {gallery.length === 0 ? null : (
        <PdfSection title="Fotos">
          <View style={styles.gallery}>
            {gallery.map((bytes, index) => (
              <View key={index.toString()} wrap={false}>
                <PdfPhoto bytes={bytes} {...PORTRAIT.photo} />
              </View>
            ))}
          </View>
        </PdfSection>
      )}
    </View>
  );
}

/** Las columnas de la grilla: ancho en puntos (la dirección se estira). */
const GRID_COLUMNS = [
  ['Foto', GRID_THUMB.width + 8],
  ['Código', 58],
  ['Propiedad', undefined],
  ['Operación y precio', 120],
  ['Amb.', 34],
  ['Dorm.', 34],
  ['Baños', 34],
  ['Sup. cub.', 52],
  ['Sup. total', 52],
  ['Expensas', 70],
  ['Antigüedad', 56],
] as const;

function cellStyle(width: number | undefined) {
  return width === undefined ? { flex: 1 } : { width };
}

function GridRow({ prepared }: { readonly prepared: PreparedSheet }): ReactElement {
  const { sheet, photos } = prepared;
  const { property } = sheet;
  const c = property.characteristics;
  const [thumb] = photos;
  const m2 = (value: number | undefined) => (value === undefined ? '—' : formatSquareMeters(value));
  const plain = [
    count(c.rooms) ?? '—',
    count(c.bedrooms) ?? '—',
    count(c.bathrooms) ?? '—',
    m2(c.surfaceCoveredM2),
    m2(c.surfaceTotalM2),
    property.deal.expensesCents === undefined
      ? '—'
      : formatMoney('ARS', property.deal.expensesCents),
    c.ageYears === undefined ? '—' : formatAge(c.ageYears),
  ];
  return (
    <View style={styles.row} wrap={false}>
      <View style={styles.thumbCell}>
        {thumb === undefined ? (
          <View style={styles.thumbEmpty} />
        ) : (
          <PdfPhoto bytes={thumb} {...GRID_THUMB} />
        )}
      </View>
      <View style={[styles.cell, cellStyle(GRID_COLUMNS[1][1])]}>
        <Text style={styles.cellStrong}>{property.code}</Text>
      </View>
      <View style={[styles.cell, { flex: 1 }]}>
        <Text style={styles.cellStrong}>{property.portalTitle}</Text>
        {sheet.address === '' ? null : <Text style={styles.cellMuted}>{sheet.address}</Text>}
      </View>
      <View style={[styles.cell, cellStyle(GRID_COLUMNS[3][1])]}>
        {sheet.prices.length === 0 ? (
          <Text style={styles.cellMuted}>—</Text>
        ) : (
          sheet.prices.map((price) => (
            <Text key={`${price.operation}-${price.currency}`} style={styles.cellStrong}>
              <Text style={styles.cellMuted}>{operationLabel(price)} </Text>
              {amount(price)}
            </Text>
          ))
        )}
      </View>
      {plain.map((value, index) => (
        <Text
          key={GRID_COLUMNS[index + 4]?.[0]}
          style={[styles.cell, cellStyle(GRID_COLUMNS[index + 4]?.[1])]}
        >
          {value}
        </Text>
      ))}
    </View>
  );
}

function GridHeader(): ReactElement {
  return (
    <View style={styles.headRow} fixed>
      {GRID_COLUMNS.map(([label, width]) => (
        <Text key={label} style={[styles.head, cellStyle(width)]}>
          {label.toUpperCase()}
        </Text>
      ))}
    </View>
  );
}

/** Agrupa por tipo, en el orden en que aparece cada tipo (las propiedades llegan por código). */
function byKind(sheets: readonly PreparedSheet[]): (readonly [string, PreparedSheet[]])[] {
  const groups = new Map<string, PreparedSheet[]>();
  for (const prepared of sheets) {
    const kind = prepared.sheet.property.propertyType;
    groups.set(kind, [...(groups.get(kind) ?? []), prepared]);
  }
  return [...groups.entries()];
}

// ---------- El renderer ----------

/** La ficha en PDF con react-pdf (ADR 0051), en el formato pedido. */
export class ReactPdfPropertySheetRenderer implements PropertySheetRenderer {
  async render(content: PropertySheetsContent): Promise<Uint8Array> {
    const { layout } = content;
    const prepared: PreparedSheet[] = [];
    // De a una: las fotos se achican apenas llegan y los originales no quedan en memoria.
    for await (const sheet of content.sheets) prepared.push(await prepare(sheet, layout));

    const branding: PdfBranding = {
      logo: await logoPng(content.company.logo),
      companyName: content.company.name,
      contactLine: contactLine(content.company.contact),
    };
    const meta = { title: content.title, author: content.company.name };

    if (layout === 'grid') {
      // Una sola tabla: la cabecera se repite en cada hoja y cada tipo abre con su fila.
      return renderPdf(
        <PdfDocument meta={meta}>
          <PdfPage branding={branding} orientation="landscape" footerNote={LEGAL_NOTE}>
            <GridHeader />
            {byKind(prepared).map(([kind, rows]) => (
              <View key={kind}>
                <View style={styles.groupRow} minPresenceAhead={60}>
                  <Text style={styles.groupTitle}>
                    {kindLabel(kind).toUpperCase()} · {rows.length.toString()}
                  </Text>
                </View>
                {rows.map((row) => (
                  <GridRow key={row.sheet.property.id} prepared={row} />
                ))}
              </View>
            ))}
            <Agent agent={content.agent} />
          </PdfPage>
        </PdfDocument>,
      );
    }

    return renderPdf(
      <PdfDocument meta={meta}>
        {prepared.map((entry) => (
          <PdfPage
            key={entry.sheet.property.id}
            branding={branding}
            orientation={
              layout === 'landscape' || layout === 'landscape_map' ? 'landscape' : 'portrait'
            }
            footerNote={LEGAL_NOTE}
          >
            {layout === 'landscape' || layout === 'landscape_map' ? (
              <LandscapeSheet prepared={entry} layout={layout} agent={content.agent} />
            ) : (
              <PortraitSheet prepared={entry} agent={content.agent} />
            )}
          </PdfPage>
        ))}
      </PdfDocument>,
    );
  }
}
