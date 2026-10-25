import { auditAction, diffChanges, err, ok, type Actor, type Result } from '../../../shared';
import { PropertyOwnerInputSchema, type PropertyOwnerInput } from '../../contracts';
import type { PropertyInTrashError } from '../../domain/property';
import { canAddOwner, type TooManyOwnersError } from '../../domain/property-owners';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  canEditProperties,
  invalidInput,
  loadForEdit,
  propertyTarget,
  type EditPropertyError,
} from '../property-support';

/** El cliente no existe, está en la papelera o se unificó con otro. */
export interface OwnerClientNotFoundError {
  readonly type: 'OwnerClientNotFound';
}

export type AddPropertyOwnerError =
  EditPropertyError | PropertyInTrashError | TooManyOwnersError | OwnerClientNotFoundError;

/**
 * Suma un propietario desde la ficha: requiere `properties:change-producer` ("cambiar el productor
 * o los propietarios"), además de poder editar la propiedad. El historial queda en la propiedad,
 * con el cliente en `client_ids` para la supresión.
 */
export class AddPropertyOwner {
  constructor(private readonly deps: { readonly uow: PropertiesUnitOfWork }) {}

  async execute(
    input: PropertyOwnerInput,
    actor: Actor,
  ): Promise<Result<void, AddPropertyOwnerError>> {
    if (!canEditProperties(actor) || !actor.can('properties:change-producer')) {
      return err({ type: 'Forbidden' });
    }
    const parsed = PropertyOwnerInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { propertyId, clientId } = parsed.data;

    return this.deps.uow.run(async (tx): Promise<Result<void, AddPropertyOwnerError>> => {
      const loaded = await loadForEdit(tx, actor, propertyId);
      if (loaded.isErr()) return err(loaded.error);
      const property = loaded.value;
      const [alreadyOwner, count] = await Promise.all([
        tx.owners.has(property.id, clientId),
        tx.owners.count(property.id),
      ]);
      const allowed = canAddOwner({ inTrash: property.isDeleted, alreadyOwner, count });
      if (allowed.isErr()) return err(allowed.error);
      if (!allowed.value) return ok(undefined);
      if (!(await tx.owners.isLinkable(clientId))) return err({ type: 'OwnerClientNotFound' });

      await tx.owners.add(property.id, clientId, actor.id);
      await tx.audit.record(
        auditAction(
          actor,
          { ...propertyTarget('property.owner_added', property.id), clientIds: [clientId] },
          diffChanges({}, { clientId }),
        ),
      );
      return ok(undefined);
    });
  }
}
