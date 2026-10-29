import {
  OPERATIONS,
  PROPERTY_KIND_LABELS,
  type ExportFile,
  type PropertyExportFormat,
  type PropertyExportRow,
  type PropertyExportWriter,
  type PropertyStatusValue,
} from '@norde/core/properties';

import { amount, csvStream, day, isoDay, xlsxStream, type Column } from './spreadsheet';

// Planilla (CSV o Excel) de una exportación de propiedades, con las columnas de la de Tokko. Arma
// el archivo a medida que llegan los lotes; nunca tiene la exportación entera en memoria. El PDF de
// la selección es otro pedido (#175).

const STATUS_LABELS: Readonly<Record<PropertyStatusValue, string>> = {
  draft: 'Borrador',
  available: 'Disponible',
  reserved: 'Reservada',
  sold: 'Vendida',
  rented: 'Alquilada',
  paused: 'Pausada',
  withdrawn: 'Dada de baja',
};

const OPERATION_LABELS = { sale: 'Venta', rent: 'Alquiler', temporary_rent: 'Temporario' } as const;

type PropertyColumn = Column<PropertyExportRow>;

const OPERATION_COLUMNS: readonly PropertyColumn[] = OPERATIONS.flatMap(
  (operation): PropertyColumn[] => {
    const find = (r: PropertyExportRow) => r.operations.find((o) => o.operation === operation);
    return [
      {
        header: `${OPERATION_LABELS[operation]}: moneda`,
        width: 10,
        value: (r) => find(r)?.currency,
      },
      {
        header: `${OPERATION_LABELS[operation]}: precio`,
        width: 14,
        value: (r) => {
          const found = find(r);
          if (found === undefined) return undefined;
          return found.priceCents === null ? 'Consultar' : amount(found.priceCents);
        },
      },
    ];
  },
);

const COLUMNS: readonly PropertyColumn[] = [
  { header: 'Código', width: 12, value: (r) => r.code },
  { header: 'Tipo', width: 14, value: (r) => PROPERTY_KIND_LABELS[r.propertyType] },
  { header: 'Estado', width: 14, value: (r) => STATUS_LABELS[r.status] },
  { header: 'Título', width: 40, value: (r) => r.portalTitle },
  { header: 'Dirección', width: 30, value: (r) => r.details.address },
  { header: 'Dirección para publicar', width: 30, value: (r) => r.publishAddress },
  { header: 'Barrio', width: 18, value: (r) => r.neighborhood },
  { header: 'Localidad', width: 18, value: (r) => r.city },
  { header: 'Provincia', width: 18, value: (r) => r.province },
  { header: 'Emprendimiento', width: 22, value: (r) => r.details.development },
  ...OPERATION_COLUMNS,
  { header: 'Expensas (ARS)', width: 12, value: (r) => amount(r.details.expensesCents) },
  { header: 'Ambientes', width: 10, value: (r) => r.attributes.rooms },
  { header: 'Dormitorios', width: 11, value: (r) => r.attributes.bedrooms },
  { header: 'Baños', width: 8, value: (r) => r.attributes.bathrooms },
  { header: 'Toilettes', width: 9, value: (r) => r.details.toilets },
  { header: 'Cocheras', width: 9, value: (r) => r.attributes.parkingSpaces },
  { header: 'Antigüedad (años)', width: 12, value: (r) => r.attributes.ageYears },
  { header: 'Sup. total (m²)', width: 12, value: (r) => r.attributes.surfaceTotalM2 },
  { header: 'Sup. cubierta (m²)', width: 12, value: (r) => r.attributes.surfaceCoveredM2 },
  { header: 'Sup. semicubierta (m²)', width: 12, value: (r) => r.details.surfaceSemiCoveredM2 },
  { header: 'Terreno (m²)', width: 12, value: (r) => r.details.surfaceLandM2 },
  { header: 'Frente (m)', width: 10, value: (r) => r.details.frontM },
  { header: 'Fondo (m)', width: 10, value: (r) => r.details.depthM },
  { header: 'Captador', width: 22, value: (r) => r.producer?.name },
  { header: 'Usuario de mantenimiento', width: 22, value: (r) => r.details.maintenanceUser },
  { header: 'Sucursal', width: 16, value: (r) => r.details.branch },
  { header: 'Alta', width: 12, value: (r) => day(r.createdAt) },
  { header: 'Última actualización', width: 12, value: (r) => day(r.updatedAt) },
];

/** Los datos del propietario: solo si quien exporta puede verlos. */
const OWNER_COLUMNS: readonly PropertyColumn[] = [
  { header: 'Propietario', width: 26, value: (r) => r.details.owner?.name },
  { header: 'Email', width: 28, value: (r) => r.details.owner?.email },
  { header: 'Celular', width: 16, value: (r) => r.details.owner?.mobile },
];

const CONTENT_TYPES: Readonly<Record<PropertyExportFormat, string>> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** CSV a mano y Excel con exceljs (en streaming). */
export class FilePropertyExportWriter implements PropertyExportWriter {
  write(
    format: PropertyExportFormat,
    batches: AsyncIterable<readonly PropertyExportRow[]>,
    meta: { readonly generatedAt: Date; readonly includeOwners: boolean },
  ): ExportFile {
    const columns = meta.includeOwners ? [...COLUMNS, ...OWNER_COLUMNS] : COLUMNS;
    const body =
      format === 'csv' ? csvStream(columns, batches) : xlsxStream('Propiedades', columns, batches);
    return {
      filename: `propiedades-${isoDay.format(meta.generatedAt)}.${format}`,
      contentType: CONTENT_TYPES[format],
      body,
    };
  }
}
