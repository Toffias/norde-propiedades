import { Readable } from 'node:stream';

import {
  err,
  ok,
  type Result,
  type Spreadsheet,
  type SpreadsheetReader,
  type SpreadsheetRow,
  type UnreadableSpreadsheetError,
} from '@norde/core/shared';
import ExcelJS from 'exceljs';

// Lee la primera hoja de un `.xlsx` subido para importar. El archivo ya llegó acotado en tamaño
// (contract) y las filas, en cantidad (dominio): se carga entero. Pero llega comprimido, y una
// planilla chica puede inflarse a gigas: antes de abrirlo se mira cuánto ocupa descomprimido.

/**
 * Cuánto puede ocupar el `.xlsx` descomprimido. Sobra para 10.000 filas (el tope más alto de las
 * importaciones) con decenas de columnas.
 */
export const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;

/** Firma del registro de fin del directorio central de un ZIP. */
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
/** Firma de cada entrada del directorio central. */
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;

/**
 * La suma de los tamaños descomprimidos que declara el directorio central del ZIP, sin inflar
 * nada. `undefined` si el directorio no se puede leer (o es ZIP64): se trata como demasiado
 * grande.
 */
export function declaredUncompressedSize(bytes: Uint8Array): number | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // El registro de fin mide 22 bytes más un comentario de hasta 65.535.
  const lowest = Math.max(0, bytes.byteLength - 22 - 0xffff);
  let end = -1;
  for (let offset = bytes.byteLength - 22; offset >= lowest; offset--) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY) {
      end = offset;
      break;
    }
  }
  if (end < 0) return undefined;
  const entries = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  let total = 0;
  for (let index = 0; index < entries; index++) {
    if (offset + 46 > bytes.byteLength) return undefined;
    if (view.getUint32(offset, true) !== CENTRAL_DIRECTORY_ENTRY) return undefined;
    const size = view.getUint32(offset + 24, true);
    // 0xFFFFFFFF: el tamaño real está en el campo extra de ZIP64.
    if (size === 0xffffffff) return undefined;
    total += size;
    offset +=
      46 +
      view.getUint16(offset + 28, true) +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
  }
  return total;
}

/** El texto de una celda: fórmulas por su resultado, links y texto enriquecido por su texto. */
function cellText(value: ExcelJS.CellValue): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if ('richText' in value)
    return (
      value.richText
        .map((part) => part.text)
        .join('')
        .trim() || undefined
    );
  if ('formula' in value || 'sharedFormula' in value) {
    const result = value.result;
    return result === undefined || (typeof result === 'object' && !(result instanceof Date))
      ? undefined
      : cellText(result);
  }
  if ('text' in value) return cellText(value.text);
  // Errores de Excel (#N/A, #REF!): la celda no tiene un valor.
  return undefined;
}

export class XlsxSpreadsheetReader implements SpreadsheetReader {
  readonly #maxUncompressedBytes: number;

  constructor(options: { readonly maxUncompressedBytes?: number } = {}) {
    this.#maxUncompressedBytes = options.maxUncompressedBytes ?? MAX_UNCOMPRESSED_BYTES;
  }

  async open(bytes: Uint8Array): Promise<Result<Spreadsheet, UnreadableSpreadsheetError>> {
    const size = declaredUncompressedSize(bytes);
    // No se puede saber cuánto ocupa, o es demasiado: no se infla.
    if (size === undefined || size > this.#maxUncompressedBytes) {
      return err({ type: 'UnreadableSpreadsheet' });
    }
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.read(Readable.from([bytes]));
    } catch {
      // No es un .xlsx (o está dañado): es un error esperado del archivo, no del sistema.
      return err({ type: 'UnreadableSpreadsheet' });
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) return err({ type: 'UnreadableSpreadsheet' });

    const headerRow = sheet.getRow(1);
    const titles = Array.from({ length: headerRow.cellCount }, (_, index) =>
      cellText(headerRow.getCell(index + 1).value),
    );
    // Las columnas llegan hasta el último encabezado con texto.
    const columns = titles.findLastIndex((title) => title !== undefined) + 1;
    const headers = titles
      .slice(0, columns)
      .map((title, index) => title ?? `Columna ${String(index + 1)}`);

    const rows: SpreadsheetRow[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const cells = Array.from({ length: columns }, (_, index) =>
        cellText(row.getCell(index + 1).value),
      );
      if (cells.some((cell) => cell !== undefined)) rows.push({ rowNumber, cells });
    });

    return ok({
      headers,
      rowCount: rows.length,
      async *rows() {
        for (const row of rows) yield await Promise.resolve(row);
      },
    });
  }
}
