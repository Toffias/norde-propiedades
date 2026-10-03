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
// (contract) y las filas, en cantidad (dominio): se carga entero.

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
  async open(bytes: Uint8Array): Promise<Result<Spreadsheet, UnreadableSpreadsheetError>> {
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
