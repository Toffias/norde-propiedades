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
  ListDevelopmentUnitImportProblemsQuerySchema,
  type DevelopmentUnitImportProblemRow,
  type ListDevelopmentUnitImportProblemsQuery,
} from '../../contracts';
import { loadDevelopmentForEdit, type DevelopmentNotFoundError } from '../development-support';
import type { DevelopmentUnitImportQuery } from '../ports/development-unit-import-query';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput, type InvalidInputError } from '../property-support';
import { canImportUnits } from '../unit-import-support';

import type { DevelopmentUnitImportNotFoundError } from './get-development-unit-import';

export type ListDevelopmentUnitImportProblemsError =
  | ForbiddenError
  | InvalidInputError
  | DevelopmentNotFoundError
  | DevelopmentUnitImportNotFoundError;

/** Las filas que no se importaron, por número de fila: qué dato tenían mal y la unidad, si existe. */
export class ListDevelopmentUnitImportProblems {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly imports: DevelopmentUnitImportQuery;
    },
  ) {}

  async execute(
    input: ListDevelopmentUnitImportProblemsQuery,
    actor: Actor,
  ): Promise<
    Result<Page<DevelopmentUnitImportProblemRow>, ListDevelopmentUnitImportProblemsError>
  > {
    if (!canImportUnits(actor)) return err({ type: 'Forbidden' });
    const parsed = ListDevelopmentUnitImportProblemsQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const query = parsed.data;

    const development = await this.deps.uow.run((tx) =>
      loadDevelopmentForEdit(tx, actor, query.developmentId),
    );
    if (development.isErr()) return err(development.error);
    const found = await this.deps.imports.find(query.importId);
    if (found?.developmentId !== development.value.id) {
      return err({ type: 'DevelopmentUnitImportNotFound' });
    }

    const { page, pageSize } = query;
    const slice = await this.deps.imports.problems({
      importId: found.id,
      direction: query.sort.direction,
      ...toOffsetLimit({ page, pageSize }),
    });
    return ok(toPage(slice, { page, pageSize }));
  }
}
