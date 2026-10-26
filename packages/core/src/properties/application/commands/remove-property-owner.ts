import { auditAction, diffChanges, err, ok, type Actor, type Result } from '../../../shared';
import { PropertyOwnerInputSchema, type PropertyOwnerInput } from '../../contracts';
import type { PropertyInTrashError } from '../../domain/property';
import { canRemoveOwner } from '../../domain/property-owners';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  canEditProperties,
  invalidInput,
  loadForEdit,
  propertyTarget,
  type EditPropertyError,
} from '../property-support';

export type RemovePropertyOwnerError = EditPropertyError | PropertyInTrashError;

/**
 * Quita un propietario desde la ficha, con el mismo permiso que para sumarlo. El cliente sigue en
 * contactos: solo se desvincula. Si no era propietario, no cambia nada.
 */
export class RemovePropertyOwner {
  constructor(private readonly deps: { readonly uow: PropertiesUnitOfWork }) {}

  async execute(
    input: PropertyOwnerInput,
    actor: Actor,
  ): Promise<Result<void, RemovePropertyOwnerError>> {
    if (!canEditProperties(actor) || !actor.can('properties:change-producer')) {
      return err({ type: 'Forbidden' });
    }
    const parsed = PropertyOwnerInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { propertyId, clientId } = parsed.data;

    return this.deps.uow.run(async (tx): Promise<Result<void, RemovePropertyOwnerError>> => {
      const loaded = await loadForEdit(tx, actor, propertyId);
      if (loaded.isErr()) return err(loaded.error);
      const property = loaded.value;
      const isOwner = await tx.owners.has(property.id, clientId);
      const allowed = canRemoveOwner({ inTrash: property.isDeleted, isOwner });
      if (allowed.isErr()) return err(allowed.error);
      if (!allowed.value) return ok(undefined);

      await tx.owners.remove(property.id, clientId);
      await tx.audit.record(
        auditAction(
          actor,
          { ...propertyTarget('property.owner_removed', property.id), clientIds: [clientId] },
          diffChanges({ clientId }, {}),
        ),
      );
      return ok(undefined);
    });
  }
}
