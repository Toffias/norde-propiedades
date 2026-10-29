import {
  OPERATION_LABELS,
  type AppraisalSheetContent,
  type AppraisalSheetFeature,
  type AppraisalSheetRenderer,
  type OwnerContact,
} from '@norde/core/properties';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ReactElement, ReactNode } from 'react';

import { formatAge, formatMeters, formatMoney, formatPhone, formatSquareMeters } from './format';
import { PdfIcon } from './icons';
import { logoPng } from './images';
import { PdfDocument, PdfPage, type PdfBranding } from './kit';
import { kindLabel } from './property-text';
import { renderPdf } from './render';
import { PDF_COLORS, PDF_TYPE } from './theme';

// La planilla de tasación (#175, etapa 4), como el "PDF de tasación" de Tokko: una hoja para
// imprimir y completar a mano en la visita. Mejora la de Tokko:
// - lo que ya está cargado en la ficha sale escrito, y lo que falta queda con una línea para
//   completarlo;
// - las casillas de servicios, ambientes y adicionales salen marcadas si ya están en la ficha;
// - el texto es real (se puede copiar y buscar) y la hoja no deja medio A4 vacío: los recuadros para
//   escribir crecen.

const VALUE_OPERATIONS = ['sale', 'rent', 'temporary_rent'] as const;

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

const dateFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const percent = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

const styles = StyleSheet.create({
  title: { fontSize: 16, lineHeight: 1.15, fontWeight: 800 },
  meta: { fontSize: PDF_TYPE.body, lineHeight: 1.4, color: PDF_COLORS.muted, marginTop: 2 },
  metaStrong: { fontSize: PDF_TYPE.body, lineHeight: 1.4, fontWeight: 600 },
  intro: { marginBottom: 6 },
  columns: { flexDirection: 'row', gap: 6, alignItems: 'stretch' },
  main: { flex: 1, gap: 6 },
  box: {
    backgroundColor: '#faf8f5',
    borderWidth: 0.6,
    borderColor: PDF_COLORS.rule,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 7,
  },
  boxTitle: {
    fontSize: PDF_TYPE.body,
    lineHeight: 1.2,
    fontWeight: 800,
    letterSpacing: 0.8,
    color: PDF_COLORS.brand,
    paddingBottom: 3,
    marginBottom: 5,
    borderBottomWidth: 0.6,
    borderBottomColor: PDF_COLORS.rule,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 },
  field: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, paddingRight: 10 },
  fieldLabel: { fontSize: PDF_TYPE.small, lineHeight: 1.2, color: PDF_COLORS.muted },
  fieldValue: { fontSize: PDF_TYPE.body, lineHeight: 1.2, fontWeight: 600 },
  blank: { flex: 1, height: 9, borderBottomWidth: 0.6, borderBottomColor: PDF_COLORS.muted },
  valueBox: { width: 168 },
  operation: {
    fontSize: PDF_TYPE.small,
    lineHeight: 1.2,
    fontWeight: 800,
    backgroundColor: PDF_COLORS.sand,
    paddingHorizontal: 5,
    paddingTop: 3,
    paddingBottom: 2,
    marginBottom: 4,
  },
  currency: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginBottom: 6 },
  currencyLabel: { width: 20, fontSize: PDF_TYPE.body, lineHeight: 1.2, fontWeight: 800 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 4, width: '25%', paddingRight: 4 },
  checkbox: {
    width: 8,
    height: 8,
    borderWidth: 0.8,
    borderColor: PDF_COLORS.muted,
    borderRadius: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: { flex: 1, fontSize: PDF_TYPE.small, lineHeight: 1.2 },
  empty: { fontSize: PDF_TYPE.small, lineHeight: 1.3, color: PDF_COLORS.muted },
  writeIn: {
    backgroundColor: PDF_COLORS.paper,
    borderWidth: 0.6,
    borderColor: PDF_COLORS.rule,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  rule: { height: 15, borderBottomWidth: 0.5, borderBottomColor: PDF_COLORS.rule },
  current: { fontSize: PDF_TYPE.small, lineHeight: 1.35, color: PDF_COLORS.muted, marginBottom: 4 },
});

// ---------- Lo que se imprime ----------

type Detail = AppraisalSheetContent['property'];

interface SheetField {
  readonly label: string;
  /** Sin valor: una línea para completarlo a mano. */
  readonly value: string | undefined;
}

function count(value: number | undefined): string | undefined {
  return value === undefined ? undefined : value.toString();
}

function m2(value: number | undefined): string | undefined {
  return value === undefined ? undefined : formatSquareMeters(value);
}

function generalFields(property: Detail): SheetField[] {
  const c = property.characteristics;
  return [
    { label: 'Ambientes', value: count(c.rooms) },
    { label: 'Dormitorios', value: count(c.bedrooms) },
    { label: 'Baños', value: count(c.bathrooms) },
    { label: 'Toilettes', value: count(c.toilets) },
    { label: 'Cocheras', value: count(c.parkingSpaces) },
    { label: 'Antigüedad', value: c.ageYears === undefined ? undefined : formatAge(c.ageYears) },
    {
      label: 'Orientación',
      value:
        c.orientation === undefined
          ? undefined
          : (ORIENTATION_LABELS[c.orientation] ?? c.orientation),
    },
    {
      label: 'Disposición',
      value:
        c.disposition === undefined
          ? undefined
          : (DISPOSITION_LABELS[c.disposition] ?? c.disposition),
    },
    {
      label: 'Estado',
      value: c.condition === undefined ? undefined : (CONDITION_LABELS[c.condition] ?? c.condition),
    },
    {
      label: 'Expensas',
      value:
        property.deal.expensesCents === undefined
          ? undefined
          : formatMoney('ARS', property.deal.expensesCents),
    },
  ];
}

function surfaceFields(property: Detail): SheetField[] {
  const c = property.characteristics;
  return [
    { label: 'Total construido', value: m2(c.surfaceTotalM2) },
    { label: 'Cubierta', value: m2(c.surfaceCoveredM2) },
    { label: 'Semicubierta', value: m2(c.surfaceSemiCoveredM2) },
    { label: 'Terreno', value: m2(c.surfaceLandM2) },
    { label: 'Frente', value: c.frontM === undefined ? undefined : formatMeters(c.frontM) },
    { label: 'Fondo', value: c.depthM === undefined ? undefined : formatMeters(c.depthM) },
  ];
}

/** "Venta 3 % · Alquiler 5 %": la comisión de cada operación cargada. */
function commissions(property: Detail): string | undefined {
  const parts = property.operations
    .filter((operation) => operation.commissionPct !== undefined)
    .map((operation) => {
      const label = OPERATION_LABELS[operation.operation].replace(/^en /, '');
      return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${percent.format(operation.commissionPct ?? 0)}\u00a0%`;
    });
  return parts.length === 0 ? undefined : parts.join(' · ');
}

function ownerLine(owner: OwnerContact): string {
  return [
    owner.name,
    owner.phone === undefined ? undefined : `Tel. ${formatPhone(owner.phone)}`,
    owner.mobile === undefined ? undefined : `Cel. ${formatPhone(owner.mobile)}`,
    owner.email,
  ]
    .filter((part) => part !== undefined)
    .join(' · ');
}

function operationLabel(operation: (typeof VALUE_OPERATIONS)[number]): string {
  const label = OPERATION_LABELS[operation].replace(/^en /, '');
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

// ---------- Piezas ----------

function Box({
  title,
  children,
  style,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly style?: Readonly<Record<string, string | number>>;
}): ReactElement {
  return (
    <View style={style === undefined ? styles.box : [styles.box, style]} wrap={false}>
      <Text style={styles.boxTitle}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Fields({
  fields,
  columns,
}: {
  readonly fields: readonly SheetField[];
  readonly columns: number;
}): ReactElement {
  const width = `${(100 / columns).toFixed(3)}%`;
  return (
    <View style={styles.grid}>
      {fields.map((field) => (
        <View key={field.label} style={[styles.field, { width }]}>
          <Text style={styles.fieldLabel}>{field.label}:</Text>
          {field.value === undefined ? (
            <View style={styles.blank} />
          ) : (
            <Text style={styles.fieldValue}>{field.value}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

function Checkboxes({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly AppraisalSheetFeature[];
}): ReactElement {
  return (
    <Box title={title}>
      {items.length === 0 ? (
        <Text style={styles.empty}>No hay ítems activos en el catálogo.</Text>
      ) : (
        <View style={styles.grid}>
          {items.map((item) => (
            <View key={item.name} style={styles.check}>
              <View style={styles.checkbox}>
                {item.checked ? <PdfIcon name="check" size={7} /> : null}
              </View>
              <Text style={styles.checkText}>{item.name}</Text>
            </View>
          ))}
        </View>
      )}
    </Box>
  );
}

/** Un recuadro con renglones para escribir a mano. */
function WriteIn({
  lines,
  current,
}: {
  readonly lines: number;
  readonly current?: string | undefined;
}): ReactElement {
  return (
    <View style={styles.writeIn}>
      {current === undefined ? null : <Text style={styles.current}>{current}</Text>}
      {Array.from({ length: lines }, (_, index) => (
        <View key={index} style={styles.rule} />
      ))}
    </View>
  );
}

function ValueBox(): ReactElement {
  return (
    <Box title="Tasación" style={styles.valueBox}>
      {VALUE_OPERATIONS.map((operation) => (
        <View key={operation}>
          <Text style={styles.operation}>{operationLabel(operation)}</Text>
          {['$', 'U$S'].map((currency) => (
            <View key={currency} style={styles.currency}>
              <Text style={styles.currencyLabel}>{currency}</Text>
              <View style={styles.blank} />
            </View>
          ))}
        </View>
      ))}
    </Box>
  );
}

function Header({ content }: { readonly content: AppraisalSheetContent }): ReactElement {
  const { property } = content;
  const location = property.locationPath.map((level) => level.name).join(', ');
  return (
    <View style={styles.intro}>
      <Text style={styles.title}>Planilla de tasación</Text>
      <Text style={styles.meta}>
        <Text style={styles.metaStrong}>{property.code}</Text> · {kindLabel(property.propertyType)}{' '}
        · {dateFormat.format(content.generatedAt)}
      </Text>
      {content.address === '' ? null : <Text style={styles.meta}>{content.address}</Text>}
      {location === '' ? null : <Text style={styles.meta}>Ubicación: {location}</Text>}
      {content.owners.map((owner) => (
        <Text key={owner.name} style={styles.meta}>
          Propietario: <Text style={styles.metaStrong}>{ownerLine(owner)}</Text>
        </Text>
      ))}
    </View>
  );
}

/** La planilla de tasación con react-pdf (ADR 0051). */
export class ReactPdfAppraisalSheetRenderer implements AppraisalSheetRenderer {
  async render(content: AppraisalSheetContent): Promise<Uint8Array> {
    const { property, features } = content;
    const branding: PdfBranding = {
      logo: await logoPng(content.company.logo),
      companyName: content.company.name,
      contactLine: undefined,
    };
    const internal: SheetField[] = [
      {
        label: 'Tasador',
        value:
          property.internal.appraisers.length === 0
            ? undefined
            : property.internal.appraisers.map((user) => user.name ?? '').join(', '),
      },
      { label: 'Productor', value: property.producer?.name },
      { label: 'Comisión operación', value: commissions(property) },
      { label: 'Comisión productor', value: undefined },
      { label: 'Llaves', value: property.internal.keysLocation },
    ];
    return renderPdf(
      <PdfDocument
        meta={{ title: `Planilla de tasación ${property.code}`, author: content.company.name }}
      >
        <PdfPage branding={branding} footerNote="Planilla de tasación · uso interno">
          <Header content={content} />
          <View style={styles.columns}>
            <View style={styles.main}>
              <Box title="Información general">
                <Fields fields={generalFields(property)} columns={3} />
              </Box>
              <Box title="Superficies y medidas">
                <Fields fields={surfaceFields(property)} columns={3} />
              </Box>
            </View>
            <ValueBox />
          </View>
          <View style={{ gap: 6, marginTop: 6 }}>
            <Checkboxes title="Servicios" items={features.service} />
            <Checkboxes title="Ambientes" items={features.room} />
            <Checkboxes title="Adicionales" items={features.amenity} />
            <Box title="Descripción">
              <WriteIn lines={4} />
            </Box>
            <Box title="Información interna">
              <Fields fields={internal} columns={2} />
              <View style={{ marginTop: 5 }}>
                <WriteIn lines={2} />
              </View>
            </Box>
          </View>
        </PdfPage>
      </PdfDocument>,
    );
  }
}
