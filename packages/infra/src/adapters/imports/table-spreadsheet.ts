import type { Spreadsheet, SpreadsheetRow } from '@norde/core/shared';

/**
 * Una planilla a partir de sus filas ya leídas como texto: la primera son los encabezados, las
 * columnas llegan hasta el último encabezado con texto y las filas sin datos no se cuentan.
 * `firstRowNumber` es el número de la fila de encabezados en el archivo.
 */
export function tableSpreadsheet(
  table: readonly (readonly (string | undefined)[])[],
  firstRowNumber = 1,
): Spreadsheet {
  const titles = table[0] ?? [];
  const columns = titles.findLastIndex((title) => title !== undefined) + 1;
  const headers = titles
    .slice(0, columns)
    .map((title, index) => title ?? `Columna ${String(index + 1)}`);

  const rows: SpreadsheetRow[] = [];
  table.slice(1).forEach((row, index) => {
    const cells = Array.from({ length: columns }, (_, column) => row[column]);
    if (cells.some((cell) => cell !== undefined)) {
      rows.push({ rowNumber: firstRowNumber + index + 1, cells });
    }
  });

  return {
    headers,
    rowCount: rows.length,
    async *rows() {
      for (const row of rows) yield await Promise.resolve(row);
    },
  };
}

/** El texto de una celda, sin espacios de más; vacía: `undefined`. */
export function cellString(raw: string): string | undefined {
  return raw.trim() || undefined;
}
