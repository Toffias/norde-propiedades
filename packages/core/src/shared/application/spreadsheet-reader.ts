import type { Result } from '../domain/result';

/** Una fila con datos (las vacías no se cuentan). `rowNumber` es el de la planilla, desde 1. */
export interface SpreadsheetRow {
  readonly rowNumber: number;
  /** El texto de cada celda; una fecha llega como `AAAA-MM-DD`. Vacía: `undefined`. */
  readonly cells: readonly (string | undefined)[];
}

/** La primera hoja del archivo: la primera fila son los encabezados. */
export interface Spreadsheet {
  readonly headers: readonly string[];
  /** Filas con datos, sin el encabezado. */
  readonly rowCount: number;
  rows(): AsyncIterable<SpreadsheetRow>;
}

export interface UnreadableSpreadsheetError {
  readonly type: 'UnreadableSpreadsheet';
}

/** Lee una planilla de Excel (`.xlsx`) subida para importar. */
export interface SpreadsheetReader {
  open(bytes: Uint8Array): Promise<Result<Spreadsheet, UnreadableSpreadsheetError>>;
}
