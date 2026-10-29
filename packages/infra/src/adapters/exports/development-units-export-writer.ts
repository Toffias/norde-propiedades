import { PassThrough } from 'node:stream';

import {
  PROPERTY_KIND_LABELS,
  UNIT_EXPORT_READ_ONLY_HEADERS,
  UNIT_IMPORT_FIELD_LABELS,
  UNIT_STATUS_LABELS,
  type DevelopmentUnitsExportWriter,
  type ExportFile,
  type PropertyExportRow,
  type UnitImportFieldValue,
} from '@norde/core/properties';
import ExcelJS from 'exceljs';

// Excel de unidades de un emprendimiento ("Descargar unidades"). Los encabezados de las primeras
// columnas son los que reconoce la importación: el archivo se edita (precios, estados) y se vuelve a
// subir. Las del final (como en la planilla de Tokko) son para leer: la importación las ignora. Se
// arma a medida que llegan los lotes.

const TIME_ZONE = 'America/Argentina/Buenos_Aires';
/** `AAAA-MM-DD` de Buenos Aires, para el nombre del archivo. */
const isoDay = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE });

/**
 * Centavos → el monto de la celda. Uno entero (lo habitual en una lista de precios) va como número,
 * para poder editarlo y sumarlo; con centavos, como texto exacto ("150000.50").
 */
function amount(cents: bigint): number | string {
  if (cents % 100n === 0n) return Number(cents / 100n);
  return `${(cents / 100n).toString()}.${(cents % 100n).toString().padStart(2, '0')}`;
}

type Cell = string | number | undefined;

interface Column {
  readonly header: string;
  readonly width: number;
  readonly value: (row: PropertyExportRow) => Cell;
}

function operationColumns(
  operation: PropertyExportRow['operations'][number]['operation'],
  currencyField: UnitImportFieldValue,
  priceField: UnitImportFieldValue,
): readonly Column[] {
  const find = (r: PropertyExportRow) => r.operations.find((o) => o.operation === operation);
  return [
    { header: UNIT_IMPORT_FIELD_LABELS[currencyField], width: 12, value: (r) => find(r)?.currency },
    {
      header: UNIT_IMPORT_FIELD_LABELS[priceField],
      width: 14,
      // Sin precio, la celda queda vacía: al volver a importar, no cambia nada.
      value: (r) => {
        const cents = find(r)?.priceCents;
        return cents === undefined || cents === null ? undefined : amount(cents);
      },
    },
  ];
}

const COLUMNS: readonly Column[] = [
  { header: 'Código', width: 12, value: (r) => r.code },
  { header: UNIT_IMPORT_FIELD_LABELS.floor, width: 8, value: (r) => r.floor },
  { header: UNIT_IMPORT_FIELD_LABELS.unit, width: 10, value: (r) => r.unit },
  {
    header: UNIT_IMPORT_FIELD_LABELS.propertyType,
    width: 14,
    value: (r) => PROPERTY_KIND_LABELS[r.propertyType],
  },
  { header: UNIT_IMPORT_FIELD_LABELS.rooms, width: 11, value: (r) => r.attributes.rooms },
  {
    header: UNIT_IMPORT_FIELD_LABELS.surfaceTotalM2,
    width: 16,
    value: (r) => r.attributes.surfaceTotalM2,
  },
  {
    header: UNIT_IMPORT_FIELD_LABELS.surfaceCoveredM2,
    width: 18,
    value: (r) => r.attributes.surfaceCoveredM2,
  },
  ...operationColumns('sale', 'saleCurrency', 'salePrice'),
  ...operationColumns('rent', 'rentCurrency', 'rentPrice'),
  ...operationColumns('temporary_rent', 'temporaryRentCurrency', 'temporaryRentPrice'),
  {
    header: UNIT_IMPORT_FIELD_LABELS.status,
    width: 14,
    value: (r) => UNIT_STATUS_LABELS[r.status],
  },
  // Desde acá, solo para leer: la importación no reconoce estos encabezados.
  {
    header: UNIT_EXPORT_READ_ONLY_HEADERS.bedrooms,
    width: 11,
    value: (r) => r.attributes.bedrooms,
  },
  {
    header: UNIT_EXPORT_READ_ONLY_HEADERS.bathrooms,
    width: 8,
    value: (r) => r.attributes.bathrooms,
  },
  { header: UNIT_EXPORT_READ_ONLY_HEADERS.toilets, width: 9, value: (r) => r.details.toilets },
  {
    header: UNIT_EXPORT_READ_ONLY_HEADERS.parkingSpaces,
    width: 9,
    value: (r) => r.attributes.parkingSpaces,
  },
  {
    header: UNIT_EXPORT_READ_ONLY_HEADERS.surfaceSemiCoveredM2,
    width: 18,
    value: (r) => r.details.surfaceSemiCoveredM2,
  },
  {
    header: UNIT_EXPORT_READ_ONLY_HEADERS.surfaceLandM2,
    width: 12,
    value: (r) => r.details.surfaceLandM2,
  },
  { header: UNIT_EXPORT_READ_ONLY_HEADERS.frontM, width: 10, value: (r) => r.details.frontM },
  { header: UNIT_EXPORT_READ_ONLY_HEADERS.depthM, width: 10, value: (r) => r.details.depthM },
  {
    header: UNIT_EXPORT_READ_ONLY_HEADERS.expenses,
    width: 14,
    value: (r) => {
      const cents = r.details.expensesCents;
      return cents === undefined ? undefined : amount(cents);
    },
  },
  {
    header: UNIT_EXPORT_READ_ONLY_HEADERS.publishAddress,
    width: 30,
    value: (r) => r.publishAddress,
  },
];

/** Excel con exceljs, en streaming. */
export class XlsxDevelopmentUnitsExportWriter implements DevelopmentUnitsExportWriter {
  write(
    batches: AsyncIterable<readonly PropertyExportRow[]>,
    meta: { readonly developmentCode: string; readonly generatedAt: Date },
  ): ExportFile {
    const day = isoDay.format(meta.generatedAt);
    return {
      filename: `unidades-${meta.developmentCode.toLowerCase()}-${day}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: xlsx(batches),
    };
  }
}

function xlsx(batches: AsyncIterable<readonly PropertyExportRow[]>): AsyncIterable<Uint8Array> {
  const stream = new PassThrough();
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });
  const sheet = workbook.addWorksheet('Unidades', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = COLUMNS.map((c, index) => ({
    header: c.header,
    key: String(index),
    width: c.width,
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).commit();

  void (async () => {
    try {
      for await (const batch of batches) {
        for (const row of batch) {
          sheet.addRow(COLUMNS.map((c) => c.value(row) ?? null)).commit();
        }
      }
      sheet.commit();
      await workbook.commit();
    } catch (error) {
      // El error llega a quien lee el archivo: la descarga se corta en vez de quedar incompleta.
      stream.destroy(error instanceof Error ? error : new Error(String(error)));
    }
  })();
  return stream;
}
