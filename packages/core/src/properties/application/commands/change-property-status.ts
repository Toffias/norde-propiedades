import { err, type Actor, type Clock, type Result } from '../../../shared';
import { ChangePropertyStatusInputSchema, type ChangePropertyStatusInput } from '../../contracts';
import type {
  InvalidStatusTransitionError,
  PropertyInTrashError,
  StatusNotManualError,
} from '../../domain/property';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  canEditProperties,
  invalidInput,
  runPropertyEdit,
  type EditPropertyError,
} from '../property-support';

export type ChangePropertyStatusError =
  EditPropertyError | PropertyInTrashError | StatusNotManualError | InvalidStatusTransitionError;

/**
 * Cambia el estado desde la ficha. Marcarla disponible (lo que la habilita en la web) requiere
 * además `properties:mark-available`. Emite `PropertyStatusChanged`.
 */
export class ChangePropertyStatus {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: ChangePropertyStatusInput,
    actor: Actor,
  ): Promise<Result<void, ChangePropertyStatusError>> {
    if (!canEditProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = ChangePropertyStatusInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { propertyId, status } = parsed.data;
    if (status === 'available' && !actor.can('properties:mark-available')) {
      return err({ type: 'Forbidden' });
    }
    const now = this.deps.clock.now();

    return runPropertyEdit(this.deps.uow, actor, propertyId, {
      action: 'property.status_changed',
      apply: (property) => property.changeStatus(status, now),
    });
  }
}
