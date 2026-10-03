import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  DevelopmentUnitImportIdInputSchema,
  type DevelopmentUnitImportIdInput,
  type DevelopmentUnitImportRow,
} from '../../contracts';
import { loadDevelopmentForEdit, type DevelopmentNotFoundError } from '../development-support';
import type { DevelopmentUnitImportQuery } from '../ports/development-unit-import-query';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { UserNames } from '../ports/user-names';
import { invalidInput, type InvalidInputError } from '../property-support';
import { canImportUnits, toUnitImportRows } from '../unit-import-support';

export interface DevelopmentUnitImportNotFoundError {
  readonly type: 'DevelopmentUnitImportNotFound';
}

export type GetDevelopmentUnitImportError =
  | ForbiddenError
  | InvalidInputError
  | DevelopmentNotFoundError
  | DevelopmentUnitImportNotFoundError;

/** Una importación de unidades con su avance, dentro de su emprendimiento. */
export class GetDevelopmentUnitImport {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly imports: DevelopmentUnitImportQuery;
      readonly users: UserNames;
    },
  ) {}

  async execute(
    input: DevelopmentUnitImportIdInput,
    actor: Actor,
  ): Promise<Result<DevelopmentUnitImportRow, GetDevelopmentUnitImportError>> {
    if (!canImportUnits(actor)) return err({ type: 'Forbidden' });
    const parsed = DevelopmentUnitImportIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));

    const development = await this.deps.uow.run((tx) =>
      loadDevelopmentForEdit(tx, actor, parsed.data.developmentId),
    );
    if (development.isErr()) return err(development.error);
    const found = await this.deps.imports.find(parsed.data.importId);
    if (found?.developmentId !== development.value.id) {
      return err({ type: 'DevelopmentUnitImportNotFound' });
    }
    const [row] = await toUnitImportRows(this.deps.users, [found]);
    if (!row) return err({ type: 'DevelopmentUnitImportNotFound' });
    return ok(row);
  }
}
