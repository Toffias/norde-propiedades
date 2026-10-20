import {
  err,
  ok,
  toOffsetLimit,
  toPage,
  type Actor,
  type ForbiddenError,
  type Page,
  type Result,
} from '../../../shared';
import {
  ListPropertyImportProblemsQuerySchema,
  type ListPropertyImportProblemsQuery,
  type PropertyImportProblemRow,
} from '../../contracts';
import type { PropertyImportQuery } from '../ports/property-import-query';
import { canImportProperties } from '../property-import-support';
import { invalidInput, type InvalidInputError } from '../property-support';

export type ListPropertyImportProblemsError = ForbiddenError | InvalidInputError;

/** Las filas con problemas de una importación de Tokko, por número de fila. */
export class ListPropertyImportProblems {
  constructor(private readonly deps: { readonly imports: PropertyImportQuery }) {}

  async execute(
    input: ListPropertyImportProblemsQuery,
    actor: Actor,
  ): Promise<Result<Page<PropertyImportProblemRow>, ListPropertyImportProblemsError>> {
    if (!canImportProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = ListPropertyImportProblemsQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { importId, page, pageSize, sort } = parsed.data;

    const slice = await this.deps.imports.problems({
      importId,
      direction: sort.direction,
      ...toOffsetLimit({ page, pageSize }),
    });
    return ok(toPage({ items: [...slice.items], total: slice.total }, { page, pageSize }));
  }
}
