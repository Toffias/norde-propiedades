import { PassThrough } from 'node:stream';

import {
  PROPERTY_KIND_LABELS,
  UNIT_IMPORT_FIELD_LABELS,
  UNIT_STATUS_LABELS,
  type DevelopmentUnitsExportWriter,
  type ExportFile,
  type PanelPropertyRow,
  type UnitImportFieldValue,
} from '@norde/core/properties';
import ExcelJS from 'exceljs';

// Excel de unidades de un emprendimiento ("Descargar unidades"). Los encabezados son los que
// reconoce la importación: el archivo se edita (precios, estados) y se vuelve a subir. Se arma a
// medida que llegan los lotes.

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
  readonly value: (row: PanelPropertyRow) => Cell;
}

function operationColumns(
  operation: PanelPropertyRow['operations'][number]['operation'],
  currencyField: UnitImportFieldValue,
  priceField: UnitImportFieldValue,
): readonly Column[] {
  const find = (r: PanelPropertyRow) => r.operations.find((o) => o.operation === operation);
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
];

/** Excel con exceljs, en streaming. */
export class XlsxDevelopmentUnitsExportWriter implements DevelopmentUnitsExportWriter {
  write(
    batches: AsyncIterable<readonly PanelPropertyRow[]>,
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

function xlsx(batches: AsyncIterable<readonly PanelPropertyRow[]>): AsyncIterable<Uint8Array> {
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
