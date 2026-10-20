import {
  err,
  ok,
  type Actor,
  type ForbiddenError,
  type Result,
  type SpreadsheetReader,
  type UnreadableSpreadsheetError,
} from '../../../shared';
import {
  PreviewPropertyImportInputSchema,
  type PreviewPropertyImportInput,
  type PropertyImportPreview,
} from '../../contracts';
import {
  checkPropertyImportRows,
  PROPERTY_IMPORT_FIELDS,
  tokkoColumns,
  type EmptyPropertyImportFileError,
  type NotATokkoExportError,
  type TooManyPropertyImportRowsError,
} from '../../domain/property-import';
import { canImportProperties } from '../property-import-support';
import { invalidInput, type InvalidInputError } from '../property-support';

export type PreviewPropertyImportError =
  | ForbiddenError
  | InvalidInputError
  | UnreadableSpreadsheetError
  | NotATokkoExportError
  | EmptyPropertyImportFileError
  | TooManyPropertyImportRowsError;

/**
 * El primer paso: lee la exportación de Tokko subida, verifica que lo sea, cuenta las filas y
 * muestra qué datos trae. No guarda nada.
 */
export class PreviewPropertyImport {
  constructor(private readonly deps: { readonly reader: SpreadsheetReader }) {}

  async execute(
    input: PreviewPropertyImportInput,
    actor: Actor,
  ): Promise<Result<PropertyImportPreview, PreviewPropertyImportError>> {
    if (!canImportProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = PreviewPropertyImportInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));

    const sheet = await this.deps.reader.open(parsed.data.bytes);
    if (sheet.isErr()) return err(sheet.error);
    const columns = tokkoColumns(sheet.value.headers);
    if (columns.isErr()) return err(columns.error);
    const rows = checkPropertyImportRows(sheet.value.rowCount);
    if (rows.isErr()) return err(rows.error);

    return ok({
      rowCount: sheet.value.rowCount,
      fields: PROPERTY_IMPORT_FIELDS.filter((field) => columns.value[field] !== undefined),
    });
  }
}
