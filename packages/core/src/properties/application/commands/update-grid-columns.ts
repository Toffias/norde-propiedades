import {
  auditUpdated,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { UpdateGridColumnsInputSchema, type UpdateGridColumnsInput } from '../../contracts';
import { chooseGridColumns, type TooManyGridColumnsError } from '../../domain/grid-columns';
import { catalogTarget } from '../catalog-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { InvalidInputError } from '../property-support';

export type UpdateGridColumnsError = ForbiddenError | InvalidInputError | TooManyGridColumnsError;

/** ID de la fila única de configuración de propiedades en la auditoría. */
export const PROPERTY_SETTINGS_AUDIT_ID = 'property_settings';

/** Elige las columnas que la grilla del buscador suma a las fijas. Valen para toda la inmobiliaria. */
export class UpdateGridColumns {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: UpdateGridColumnsInput,
    actor: Actor,
  ): Promise<Result<void, UpdateGridColumnsError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });

    const parsed = UpdateGridColumnsInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const chosen = chooseGridColumns(parsed.data.columns);
    if (chosen.isErr()) return err(chosen.error);
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdateGridColumnsError>> => {
      const before = await tx.settings.gridColumns();
      const entry = auditUpdated(
        actor,
        catalogTarget('property_settings', 'property_settings.updated', PROPERTY_SETTINGS_AUDIT_ID),
        { gridColumns: before },
        { gridColumns: chosen.value },
      );
      if (!entry) return ok(undefined);

      await tx.settings.saveGridColumns(chosen.value, actor.id, now);
      await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}
