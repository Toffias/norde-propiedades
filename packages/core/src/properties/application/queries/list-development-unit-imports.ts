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
  ListDevelopmentUnitImportsQuerySchema,
  type DevelopmentUnitImportRow,
  type ListDevelopmentUnitImportsQuery,
} from '../../contracts';
import { loadDevelopmentForEdit, type DevelopmentNotFoundError } from '../development-support';
import type { DevelopmentUnitImportQuery } from '../ports/development-unit-import-query';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { UserNames } from '../ports/user-names';
import { invalidInput, type InvalidInputError } from '../property-support';
import { canImportUnits, toUnitImportRows } from '../unit-import-support';

export type ListDevelopmentUnitImportsError =
  ForbiddenError | InvalidInputError | DevelopmentNotFoundError;

/** Las importaciones de unidades de un emprendimiento, con su avance. Las ve quien puede importar. */
export class ListDevelopmentUnitImports {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly imports: DevelopmentUnitImportQuery;
      readonly users: UserNames;
    },
  ) {}

  async execute(
    input: ListDevelopmentUnitImportsQuery,
    actor: Actor,
  ): Promise<Result<Page<DevelopmentUnitImportRow>, ListDevelopmentUnitImportsError>> {
    if (!canImportUnits(actor)) return err({ type: 'Forbidden' });
    const parsed = ListDevelopmentUnitImportsQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const query = parsed.data;

    const development = await this.deps.uow.run((tx) =>
      loadDevelopmentForEdit(tx, actor, query.developmentId),
    );
    if (development.isErr()) return err(development.error);

    const { page, pageSize } = query;
    const slice = await this.deps.imports.list({
      developmentId: development.value.id,
      direction: query.sort.direction,
      ...toOffsetLimit({ page, pageSize }),
    });
    const items = await toUnitImportRows(this.deps.users, slice.items);
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
