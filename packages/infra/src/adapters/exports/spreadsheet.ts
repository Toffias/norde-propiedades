import { PassThrough } from 'node:stream';

import ExcelJS from 'exceljs';

// Piezas comunes de las planillas exportadas: celdas tipadas (los números y las fechas van como
// tales, para poder ordenar, filtrar y sumar en Excel) y el Excel armado en streaming a medida que
// llegan los lotes.

const TIME_ZONE = 'America/Argentina/Buenos_Aires';

/** `AAAA-MM-DD` de Buenos Aires, para el nombre del archivo. */
export const isoDay = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE });

/** Una fecha de calendario: Excel no tiene zona horaria, así que se guarda el día de Buenos Aires. */
export interface CalendarDay {
  readonly kind: 'day';
  readonly date: Date;
}

/** Un monto: número en la celda, con dos decimales solo si los tiene. */
export interface AmountCell {
  readonly kind: 'amount';
  readonly value: number;
  readonly decimals: boolean;
}

export type Cell = string | number | CalendarDay | AmountCell | undefined;

/** El día de Buenos Aires de un instante, como fecha de la planilla. */
export function day(instant: Date | undefined): CalendarDay | undefined {
  if (instant === undefined) return undefined;
  return { kind: 'day', date: new Date(`${isoDay.format(instant)}T00:00:00.000Z`) };
}

/**
 * Centavos → monto. Un `number` representa exacto cualquier monto inmobiliario (hasta 2^53
 * centavos); en la planilla es para leer y sumar, no se vuelve a convertir a `Money`.
 */
export function amount(cents: bigint | null | undefined): AmountCell | undefined {
  if (cents === null || cents === undefined) return undefined;
  return { kind: 'amount', value: Number(cents) / 100, decimals: cents % 100n !== 0n };
}

export interface Column<Row> {
  readonly header: string;
  readonly width: number;
  readonly value: (row: Row) => Cell;
}

const DATE_FORMAT = 'dd/mm/yyyy';
const AMOUNT_FORMAT = '#,##0';
const AMOUNT_DECIMALS_FORMAT = '#,##0.00';

/** El valor y el formato de la celda de Excel. */
function excelCell(cell: Cell): { value: ExcelJS.CellValue; numFmt: string | undefined } {
  if (cell === undefined) return { value: null, numFmt: undefined };
  if (typeof cell === 'string' || typeof cell === 'number')
    return { value: cell, numFmt: undefined };
  if (cell.kind === 'day') return { value: cell.date, numFmt: DATE_FORMAT };
  return { value: cell.value, numFmt: cell.decimals ? AMOUNT_DECIMALS_FORMAT : AMOUNT_FORMAT };
}

/** Excel con exceljs, en streaming: nunca tiene la exportación entera en memoria. */
export function xlsxStream<Row>(
  sheetName: string,
  columns: readonly Column<Row>[],
  batches: AsyncIterable<readonly Row[]>,
): AsyncIterable<Uint8Array> {
  const stream = new PassThrough();
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });
  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map((c, index) => ({
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
          const cells = columns.map((c) => excelCell(c.value(row)));
          const added = sheet.addRow(cells.map((c) => c.value));
          cells.forEach((c, index) => {
            if (c.numFmt !== undefined) added.getCell(index + 1).numFmt = c.numFmt;
          });
          added.commit();
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

const encoder = new TextEncoder();

/**
 * El texto de una celda del CSV. Separado con `;` y con coma decimal, como lo abre Excel con
 * configuración regional de Argentina.
 */
function csvCell(cell: Cell): string {
  if (cell === undefined) return '';
  let text: string;
  if (typeof cell === 'string') text = cell;
  else if (typeof cell === 'number') text = String(cell).replace('.', ',');
  else if (cell.kind === 'day') {
    const [year, month, dayOfMonth] = cell.date.toISOString().slice(0, 10).split('-');
    text = `${dayOfMonth ?? ''}/${month ?? ''}/${year ?? ''}`;
  } else {
    text = cell.decimals ? cell.value.toFixed(2).replace('.', ',') : String(cell.value);
  }
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV con BOM, a medida que llegan los lotes. */
export async function* csvStream<Row>(
  columns: readonly Column<Row>[],
  batches: AsyncIterable<readonly Row[]>,
): AsyncIterable<Uint8Array> {
  yield encoder.encode(`\uFEFF${columns.map((c) => csvCell(c.header)).join(';')}\r\n`);
  for await (const batch of batches) {
    const lines = batch.map((row) => columns.map((c) => csvCell(c.value(row))).join(';'));
    yield encoder.encode(`${lines.join('\r\n')}\r\n`);
  }
}
