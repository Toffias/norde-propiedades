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
  ListPropertyImportsQuerySchema,
  type ListPropertyImportsQuery,
  type PropertyImportRow,
} from '../../contracts';
import type { PropertyImportQuery } from '../ports/property-import-query';
import type { UserNames } from '../ports/user-names';
import { canImportProperties, toPropertyImportRows } from '../property-import-support';
import { invalidInput, type InvalidInputError } from '../property-support';

export type ListPropertyImportsError = ForbiddenError | InvalidInputError;

/** El historial de importaciones de propiedades de Tokko, con su avance. */
export class ListPropertyImports {
  constructor(
    private readonly deps: { readonly imports: PropertyImportQuery; readonly users: UserNames },
  ) {}

  async execute(
    input: ListPropertyImportsQuery,
    actor: Actor,
  ): Promise<Result<Page<PropertyImportRow>, ListPropertyImportsError>> {
    if (!canImportProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = ListPropertyImportsQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { page, pageSize, sort } = parsed.data;

    const slice = await this.deps.imports.list({
      direction: sort.direction,
      ...toOffsetLimit({ page, pageSize }),
    });
    const items = await toPropertyImportRows(this.deps.users, slice.items);
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
