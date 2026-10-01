import {
  auditUpdated,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import {
  UpdatePropertyTypeSettingInputSchema,
  type UpdatePropertyTypeSettingInput,
} from '../../contracts';
import {
  changeTypeSetting,
  type NoPropertyTypeEnabledError,
  type PropertyTypeSetting,
} from '../../domain/property-type-settings';
import { catalogTarget } from '../catalog-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { InvalidInputError } from '../property-support';

export type UpdatePropertyTypeSettingError =
  ForbiddenError | InvalidInputError | NoPropertyTypeEnabledError;

function auditState(setting: PropertyTypeSetting) {
  return { isEnabled: setting.isEnabled, visibleAttributes: setting.visibleAttributes };
}

/**
 * Habilita o deshabilita un tipo de propiedad y elige qué atributos muestra su ficha. Un tipo
 * deshabilitado no se ofrece en el alta; sus propiedades siguen en la cartera.
 */
export class UpdatePropertyTypeSetting {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: UpdatePropertyTypeSettingInput,
    actor: Actor,
  ): Promise<Result<void, UpdatePropertyTypeSettingError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });

    const parsed = UpdatePropertyTypeSettingInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { propertyType, isEnabled, visibleAttributes } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdatePropertyTypeSettingError>> => {
      const all = await tx.typeSettings.all();
      const before = await tx.typeSettings.find(propertyType);
      const changed = changeTypeSetting(all, { kind: propertyType, isEnabled, visibleAttributes });
      if (changed.isErr()) return err(changed.error);

      const entry = auditUpdated(
        actor,
        catalogTarget('property_type_setting', 'property_type_setting.updated', propertyType),
        auditState(before),
        auditState(changed.value),
      );
      if (!entry) return ok(undefined);

      await tx.typeSettings.save(changed.value, actor.id, now);
      await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}
