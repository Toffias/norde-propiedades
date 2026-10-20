import {
  err,
  ok,
  type Result,
  type Spreadsheet,
  type SpreadsheetReader,
  type UnreadableSpreadsheetError,
} from '@norde/core/shared';
import * as XLSX from 'xlsx';

import { cellString, tableSpreadsheet } from './table-spreadsheet';

// Lee la primera hoja de un `.xls` (Excel 97-2003), el formato en el que exporta Tokko Broker.
// `exceljs` solo lee `.xlsx`; SheetJS lee los dos (ADR 0038).

const DAY_MS = 86_400_000;
/** El día 0 de Excel (sistema 1900, con su 29/02/1900 inexistente) y del sistema 1904 (Mac). */
const EPOCH_1900 = Date.UTC(1899, 11, 30);
const EPOCH_1904 = Date.UTC(1904, 0, 1);

/** Un formato de número es de fecha si usa día, mes o año (y no es solo una hora). */
function isDateFormat(format: string): boolean {
  // Sin texto entre comillas, colores ni condiciones entre corchetes y caracteres escapados.
  const tokens = format.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
  return /[dy]/i.test(tokens) || (/m/i.test(tokens) && !/[hs]/i.test(tokens));
}

/** Un serial de Excel como `AAAA-MM-DD`, sin zona horaria, como lo muestra Excel. */
function serialDate(serial: number, date1904: boolean): string | undefined {
  const date = new Date((date1904 ? EPOCH_1904 : EPOCH_1900) + Math.floor(serial) * DAY_MS);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 1900) return undefined;
  return date.toISOString().slice(0, 10);
}

/** El texto de una celda: números enteros sin notación científica, fechas como `AAAA-MM-DD`. */
function cellText(cell: XLSX.CellObject | undefined, date1904: boolean): string | undefined {
  const value = cell?.v;
  if (value === undefined) return undefined;
  if (typeof value === 'string') return cellString(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') {
    if (typeof cell?.z === 'string' && isDateFormat(cell.z)) return serialDate(value, date1904);
    return Number.isInteger(value)
      ? value.toLocaleString('en-US', { useGrouping: false })
      : String(value);
  }
  // Errores de Excel (#N/A, #REF!) y fechas sueltas: la celda no tiene un valor que importar.
  return undefined;
}

/** Las dos funciones de CFB (el lector de documentos OLE de SheetJS) que se usan acá. */
interface CompoundFileApi {
  read(data: Uint8Array, options: { readonly type: 'array' }): unknown;
  find(container: unknown, path: string): unknown;
}

// SheetJS publica `CFB` sin tipos (`any`): se le da la forma de las dos funciones que se usan.
const CFB = XLSX.CFB as CompoundFileApi;

/**
 * Un `.xls` es un documento compuesto de OLE con el libro en el flujo `Workbook` (o `Book`).
 * SheetJS lee como texto lo que no reconoce: sin este control, un `.xls` dañado sería una
 * planilla con basura.
 */
function isLegacyWorkbook(bytes: Uint8Array): boolean {
  try {
    const container = CFB.read(bytes, { type: 'array' });
    return Boolean(CFB.find(container, 'Workbook') ?? CFB.find(container, 'Book'));
  } catch {
    // No es un documento OLE válido: el archivo está dañado.
    return false;
  }
}

export class XlsSpreadsheetReader implements SpreadsheetReader {
  open(bytes: Uint8Array): Promise<Result<Spreadsheet, UnreadableSpreadsheetError>> {
    if (!isLegacyWorkbook(bytes)) return Promise.resolve(err({ type: 'UnreadableSpreadsheet' }));
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(bytes, { type: 'array', dense: true, cellNF: true });
    } catch {
      // El libro está dañado: es un error esperado del archivo, no del sistema.
      return Promise.resolve(err({ type: 'UnreadableSpreadsheet' }));
    }
    const name = workbook.SheetNames[0];
    const sheet = name === undefined ? undefined : workbook.Sheets[name];
    if (!sheet) return Promise.resolve(err({ type: 'UnreadableSpreadsheet' }));

    const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
    // Con `dense`, las celdas están en `!data` por fila y columna, desde A1.
    const data = sheet['!data'] ?? [];
    const date1904 = workbook.Workbook?.WBProps?.date1904 === true;
    const table = Array.from({ length: range.e.r - range.s.r + 1 }, (_, r) =>
      Array.from({ length: range.e.c + 1 }, (_, c) => cellText(data[range.s.r + r]?.[c], date1904)),
    );
    return Promise.resolve(ok(tableSpreadsheet(table, range.s.r + 1)));
  }
}
