import {
  type Actor,
  err,
  type ForbiddenError,
  ok,
  type Result,
  type SpreadsheetReader,
  type UnreadableSpreadsheetError,
} from '../../../shared';
import {
  CLIENT_IMPORT_SAMPLE_ROWS,
  PreviewClientImportInputSchema,
  type ClientImportPreview,
  type PreviewClientImportInput,
} from '../../contracts';
import {
  checkImportRows,
  MAX_IMPORT_COLUMNS,
  suggestImportMapping,
  type EmptyImportFileError,
  type TooManyImportRowsError,
} from '../../domain/client-import';
import { invalidInput, type InvalidInputError } from '../client-support';

export interface TooManyImportColumnsError {
  readonly type: 'TooManyImportColumns';
  readonly max: number;
}

export type PreviewClientImportError =
  | ForbiddenError
  | InvalidInputError
  | UnreadableSpreadsheetError
  | EmptyImportFileError
  | TooManyImportRowsError
  | TooManyImportColumnsError;

/**
 * El primer paso de la importación: lee el Excel subido, cuenta las filas y propone qué columna
 * va con cada dato. No guarda nada.
 */
export class PreviewClientImport {
  constructor(private readonly deps: { readonly reader: SpreadsheetReader }) {}

  async execute(
    input: PreviewClientImportInput,
    actor: Actor,
  ): Promise<Result<ClientImportPreview, PreviewClientImportError>> {
    if (!actor.can('clients:import')) return err({ type: 'Forbidden' });
    const parsed = PreviewClientImportInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));

    const sheet = await this.deps.reader.open(parsed.data.bytes);
    if (sheet.isErr()) return err(sheet.error);
    const { headers, rowCount } = sheet.value;
    if (headers.length > MAX_IMPORT_COLUMNS) {
      return err({ type: 'TooManyImportColumns', max: MAX_IMPORT_COLUMNS });
    }
    const rows = checkImportRows(rowCount);
    if (rows.isErr()) return err(rows.error);

    const sample: (string | null)[][] = [];
    for await (const row of sheet.value.rows()) {
      sample.push(headers.map((_, column) => row.cells[column] ?? null));
      if (sample.length === CLIENT_IMPORT_SAMPLE_ROWS) break;
    }
    return ok({ headers, sample, rowCount, suggestedMapping: suggestImportMapping(headers) });
  }
}
