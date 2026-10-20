import {
  err,
  ok,
  type Result,
  type Spreadsheet,
  type SpreadsheetReader,
  type UnreadableSpreadsheetError,
} from '@norde/core/shared';

import { cellString, tableSpreadsheet } from './table-spreadsheet';

// Lee un `.csv` subido para importar (Tokko exporta así las propiedades). Se aceptan coma, punto y
// coma o tabulación como separador (Excel en español guarda con punto y coma) y comillas dobles
// según RFC 4180. Los valores llegan como texto: no se adivinan números ni fechas.

const DELIMITERS = [',', ';', '\t'] as const;
type Delimiter = (typeof DELIMITERS)[number];

/** UTF-8 (con o sin BOM); si no lo es, Windows-1252, el de un CSV guardado por Excel. */
function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    // No es UTF-8 válido: es el CSV "ANSI" que guarda Excel en Windows.
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** El separador que más aparece en la primera línea, fuera de comillas. */
function detectDelimiter(text: string): Delimiter {
  const counts = new Map<Delimiter, number>(DELIMITERS.map((d) => [d, 0]));
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && counts.has(char as Delimiter)) {
      // `char` es uno de los separadores: lo confirma el `has` de arriba.
      const delimiter = char as Delimiter;
      counts.set(delimiter, (counts.get(delimiter) ?? 0) + 1);
    }
  }
  return DELIMITERS.reduce((best, d) =>
    (counts.get(d) ?? 0) > (counts.get(best) ?? 0) ? d : best,
  );
}

/** Las filas del CSV, con comillas dobles (`""` es una comilla) y saltos de línea dentro. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export class CsvSpreadsheetReader implements SpreadsheetReader {
  open(bytes: Uint8Array): Promise<Result<Spreadsheet, UnreadableSpreadsheetError>> {
    // Un binario (un PDF, una imagen o un Excel dañado) no es un CSV.
    if (bytes.includes(0)) return Promise.resolve(err({ type: 'UnreadableSpreadsheet' }));
    // El decodificador UTF-8 ya saca el BOM.
    const text = decode(bytes);
    const table = parseCsv(text, detectDelimiter(text)).map((row) => row.map(cellString));
    if (!table[0]?.some((title) => title !== undefined)) {
      return Promise.resolve(err({ type: 'UnreadableSpreadsheet' }));
    }
    return Promise.resolve(ok(tableSpreadsheet(table)));
  }
}
