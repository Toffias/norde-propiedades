import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  ActiveReservationQuerySchema,
  type ActiveReservationQuery,
  type ReservationRow,
} from '../../contracts';
import type { PropertyReservationsQuery } from '../ports/property-reservations-query';
import type { UserNames } from '../ports/user-names';
import { invalidInput, type InvalidInputError } from '../property-support';
import { withUserNames } from '../reservation-rows';

export type GetActiveReservationError = ForbiddenError | InvalidInputError;

/** La reserva activa de una propiedad, para la ficha. `undefined` si no tiene. */
export class GetActiveReservation {
  constructor(
    private readonly deps: {
      readonly reservations: PropertyReservationsQuery;
      readonly users: UserNames;
    },
  ) {}

  async execute(
    input: ActiveReservationQuery,
    actor: Actor,
  ): Promise<Result<ReservationRow | undefined, GetActiveReservationError>> {
    if (!actor.can('reservations:read') || !actor.can('properties:read')) {
      return err({ type: 'Forbidden' });
    }
    const parsed = ActiveReservationQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const active = await this.deps.reservations.findActive(parsed.data.propertyId);
    if (active === undefined) return ok(undefined);
    const [row] = await withUserNames(this.deps.users, [active]);
    return ok(row);
  }
}
