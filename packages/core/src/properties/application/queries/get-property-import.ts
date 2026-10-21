import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  PropertyImportIdInputSchema,
  type PropertyImportIdInput,
  type PropertyImportRow,
} from '../../contracts';
import type { PropertyImportQuery } from '../ports/property-import-query';
import type { UserNames } from '../ports/user-names';
import { canImportProperties, toPropertyImportRows } from '../property-import-support';
import { invalidInput, type InvalidInputError } from '../property-support';

export interface PropertyImportNotFoundError {
  readonly type: 'PropertyImportNotFound';
}

export type GetPropertyImportError =
  ForbiddenError | InvalidInputError | PropertyImportNotFoundError;

/** Una importación de propiedades de Tokko con su avance. */
export class GetPropertyImport {
  constructor(
    private readonly deps: { readonly imports: PropertyImportQuery; readonly users: UserNames },
  ) {}

  async execute(
    input: PropertyImportIdInput,
    actor: Actor,
  ): Promise<Result<PropertyImportRow, GetPropertyImportError>> {
    if (!canImportProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = PropertyImportIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));

    const found = await this.deps.imports.find(parsed.data.importId);
    if (!found) return err({ type: 'PropertyImportNotFound' });
    const [row] = await toPropertyImportRows(this.deps.users, [found]);
    return row ? ok(row) : err({ type: 'PropertyImportNotFound' });
  }
}
