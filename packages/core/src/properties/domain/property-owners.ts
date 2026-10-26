import { err, ok, type Result } from '../../shared/domain/result';
import type { PropertyInTrashError } from './property';

// Los propietarios de una propiedad: clientes del módulo clients, vinculados solo por ID.

/** Tope de propietarios de una propiedad (la ficha los muestra todos juntos). */
export const MAX_PROPERTY_OWNERS = 20;

export interface TooManyOwnersError {
  readonly type: 'TooManyOwners';
  readonly max: number;
}

/**
 * Si se puede sumar un propietario: la propiedad no está en la papelera y no llegó al tope. Si ya
 * era propietario, no cambia nada (`false`).
 */
export function canAddOwner(owners: {
  readonly inTrash: boolean;
  readonly alreadyOwner: boolean;
  readonly count: number;
}): Result<boolean, PropertyInTrashError | TooManyOwnersError> {
  if (owners.inTrash) return err({ type: 'PropertyInTrash' });
  if (owners.alreadyOwner) return ok(false);
  if (owners.count >= MAX_PROPERTY_OWNERS) {
    return err({ type: 'TooManyOwners', max: MAX_PROPERTY_OWNERS });
  }
  return ok(true);
}

/** Si se puede quitar un propietario: la propiedad no está en la papelera. Si no lo era, `false`. */
export function canRemoveOwner(owners: {
  readonly inTrash: boolean;
  readonly isOwner: boolean;
}): Result<boolean, PropertyInTrashError> {
  if (owners.inTrash) return err({ type: 'PropertyInTrash' });
  return ok(owners.isOwner);
}
