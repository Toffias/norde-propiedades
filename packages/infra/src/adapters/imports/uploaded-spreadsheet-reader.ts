import type {
  Result,
  Spreadsheet,
  SpreadsheetReader,
  UnreadableSpreadsheetError,
} from '@norde/core/shared';

import { CsvSpreadsheetReader } from './csv-spreadsheet-reader';
import { XlsSpreadsheetReader } from './xls-spreadsheet-reader';
import { XlsxSpreadsheetReader } from './xlsx-spreadsheet-reader';

// Una planilla subida para importar, en el formato que sea: se reconoce por su contenido, no por
// el nombre del archivo.

/** `.xlsx`: un ZIP (`PK\x03\x04`). */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
/** `.xls`: un documento compuesto de OLE (`D0 CF 11 E0`). */
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];

const startsWith = (bytes: Uint8Array, magic: readonly number[]): boolean =>
  magic.every((byte, index) => bytes[index] === byte);

export class UploadedSpreadsheetReader implements SpreadsheetReader {
  readonly #xlsx = new XlsxSpreadsheetReader();
  readonly #xls = new XlsSpreadsheetReader();
  readonly #csv = new CsvSpreadsheetReader();

  open(bytes: Uint8Array): Promise<Result<Spreadsheet, UnreadableSpreadsheetError>> {
    if (startsWith(bytes, ZIP_MAGIC)) return this.#xlsx.open(bytes);
    if (startsWith(bytes, OLE_MAGIC)) return this.#xls.open(bytes);
    return this.#csv.open(bytes);
  }
}
