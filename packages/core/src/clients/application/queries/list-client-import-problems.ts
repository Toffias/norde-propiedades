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
  ListClientImportProblemsQuerySchema,
  type ClientImportProblemRow,
  type ListClientImportProblemsQuery,
} from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import type { ClientImportQuery } from '../ports/client-import-query';

export type ListClientImportProblemsError = ForbiddenError | InvalidInputError;

/** Las filas de una importación que no se importaron (duplicados y errores), por número de fila. */
export class ListClientImportProblems {
  constructor(private readonly deps: { readonly imports: ClientImportQuery }) {}

  async execute(
    input: ListClientImportProblemsQuery,
    actor: Actor,
  ): Promise<Result<Page<ClientImportProblemRow>, ListClientImportProblemsError>> {
    if (!actor.can('clients:import')) return err({ type: 'Forbidden' });
    const parsed = ListClientImportProblemsQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { importId, page, pageSize, sort } = parsed.data;

    const slice = await this.deps.imports.problems({
      importId,
      direction: sort.direction,
      ...toOffsetLimit({ page, pageSize }),
    });
    return ok(toPage(slice, { page, pageSize }));
  }
}
