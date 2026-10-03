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
  PreviewDevelopmentUnitImportInputSchema,
  UNIT_IMPORT_SAMPLE_ROWS,
  type DevelopmentUnitImportPreview,
  type PreviewDevelopmentUnitImportInput,
} from '../../contracts';
import {
  checkUnitImportRows,
  MAX_UNIT_IMPORT_COLUMNS,
  suggestUnitImportMapping,
  type EmptyUnitImportFileError,
  type TooManyUnitImportRowsError,
} from '../../domain/development-unit-import';
import { loadDevelopmentForEdit, type DevelopmentNotFoundError } from '../development-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput, type InvalidInputError } from '../property-support';
import { canImportUnits } from '../unit-import-support';

export interface TooManyUnitImportColumnsError {
  readonly type: 'TooManyImportColumns';
  readonly max: number;
}

export type PreviewDevelopmentUnitImportError =
  | ForbiddenError
  | InvalidInputError
  | DevelopmentNotFoundError
  | UnreadableSpreadsheetError
  | EmptyUnitImportFileError
  | TooManyUnitImportRowsError
  | TooManyUnitImportColumnsError;

/**
 * El primer paso de la importación de unidades: lee el Excel subido, cuenta las filas y propone
 * qué columna va con cada dato. No guarda nada.
 */
export class PreviewDevelopmentUnitImport {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly reader: SpreadsheetReader;
    },
  ) {}

  async execute(
    input: PreviewDevelopmentUnitImportInput,
    actor: Actor,
  ): Promise<Result<DevelopmentUnitImportPreview, PreviewDevelopmentUnitImportError>> {
    if (!canImportUnits(actor)) return err({ type: 'Forbidden' });
    const parsed = PreviewDevelopmentUnitImportInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));

    const development = await this.deps.uow.run((tx) =>
      loadDevelopmentForEdit(tx, actor, parsed.data.developmentId),
    );
    if (development.isErr()) return err(development.error);

    const sheet = await this.deps.reader.open(parsed.data.bytes);
    if (sheet.isErr()) return err(sheet.error);
    const { headers, rowCount } = sheet.value;
    if (headers.length > MAX_UNIT_IMPORT_COLUMNS) {
      return err({ type: 'TooManyImportColumns', max: MAX_UNIT_IMPORT_COLUMNS });
    }
    const rows = checkUnitImportRows(rowCount);
    if (rows.isErr()) return err(rows.error);

    const sample: (string | null)[][] = [];
    for await (const row of sheet.value.rows()) {
      sample.push(headers.map((_, column) => row.cells[column] ?? null));
      if (sample.length === UNIT_IMPORT_SAMPLE_ROWS) break;
    }
    return ok({ headers, sample, rowCount, suggestedMapping: suggestUnitImportMapping(headers) });
  }
}
