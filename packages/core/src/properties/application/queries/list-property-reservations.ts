import {
  err,
  ok,
  toOffsetLimit,
  toPage,
  type Actor,
  type ForbiddenError,
  type Page,
  type Result,
} from '../../../shared';
import {
  ListPropertyReservationsQuerySchema,
  type ListPropertyReservationsQuery,
  type ReservationRow,
} from '../../contracts';
import type { PropertyReservationsQuery } from '../ports/property-reservations-query';
import type { UserNames } from '../ports/user-names';
import { invalidInput, type InvalidInputError } from '../property-support';
import { withUserNames } from '../reservation-rows';

export type ListPropertyReservationsError = ForbiddenError | InvalidInputError;

/** Las reservas de una propiedad (activas, caídas y firmadas), paginadas en la base. */
export class ListPropertyReservations {
  constructor(
    private readonly deps: {
      readonly reservations: PropertyReservationsQuery;
      readonly users: UserNames;
    },
  ) {}

  async execute(
    input: ListPropertyReservationsQuery,
    actor: Actor,
  ): Promise<Result<Page<ReservationRow>, ListPropertyReservationsError>> {
    if (!actor.can('reservations:read') || !actor.can('properties:read')) {
      return err({ type: 'Forbidden' });
    }
    const parsed = ListPropertyReservationsQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { propertyId, page, pageSize, sort } = parsed.data;
    const slice = await this.deps.reservations.listByProperty({
      propertyId,
      sort,
      ...toOffsetLimit({ page, pageSize }),
    });
    const items = await withUserNames(this.deps.users, slice.items);
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
