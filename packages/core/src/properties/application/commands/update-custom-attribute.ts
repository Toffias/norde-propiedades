import {
  auditUpdated,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { UpdateCustomAttributeInputSchema, type UpdateCustomAttributeInput } from '../../contracts';
import type { InvalidCustomAttributeOptionsError } from '../../domain/custom-attribute';
import type { CustomAttributeNotFoundError } from '../../domain/property-details';
import { catalogTarget, customAttributeAuditState, idOf } from '../catalog-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput, type InvalidInputError } from '../property-support';
import type { CustomAttributeNameTakenError } from './create-custom-attribute';

export type UpdateCustomAttributeError =
  | ForbiddenError
  | InvalidInputError
  | CustomAttributeNotFoundError
  | CustomAttributeNameTakenError
  | InvalidCustomAttributeOptionsError;

/** Renombra un atributo personalizado, cambia sus opciones o lo desactiva. */
export class UpdateCustomAttribute {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: UpdateCustomAttributeInput,
    actor: Actor,
  ): Promise<Result<void, UpdateCustomAttributeError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });
    const parsed = UpdateCustomAttributeInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { attributeId, ...data } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdateCustomAttributeError>> => {
      const id = idOf<'CustomAttribute'>(attributeId);
      const attribute = id === undefined ? undefined : await tx.customAttributes.findById(id);
      if (!attribute) return err({ type: 'CustomAttributeNotFound', attributeId });
      const sameName = await tx.customAttributes.findByName(data.name);
      if (sameName && sameName.id !== attribute.id) {
        return err({ type: 'CustomAttributeNameTaken' });
      }

      const before = customAttributeAuditState(attribute);
      const updated = attribute.update(data, now);
      if (updated.isErr()) return err(updated.error);
      const entry = auditUpdated(
        actor,
        catalogTarget('custom_attribute', 'custom_attribute.updated', attribute.id),
        before,
        customAttributeAuditState(attribute),
      );
      if (entry === undefined) return ok(undefined);
      await tx.customAttributes.save(attribute, actor.id);
      await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}
