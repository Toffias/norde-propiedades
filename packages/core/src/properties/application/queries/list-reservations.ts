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
  ListReservationsQuerySchema,
  type ListReservationsQuery,
  type ReservationListRow,
} from '../../contracts';
import type { ReservationListQuery } from '../ports/reservation-list-query';
import type { UserNames } from '../ports/user-names';
import { invalidInput, type InvalidInputError } from '../property-support';
import { reservationCriteria } from '../reservation-filter';
import { withUserNames } from '../reservation-rows';

export type ListReservationsError = ForbiddenError | InvalidInputError;

/** Todas las reservas (`/reservas`), con filtros, paginadas en la base. */
export class ListReservations {
  constructor(
    private readonly deps: {
      readonly reservations: ReservationListQuery;
      readonly users: UserNames;
    },
  ) {}

  async execute(
    input: ListReservationsQuery,
    actor: Actor,
  ): Promise<Result<Page<ReservationListRow>, ListReservationsError>> {
    if (!actor.can('reservations:read') || !actor.can('properties:read')) {
      return err({ type: 'Forbidden' });
    }
    const parsed = ListReservationsQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { page, pageSize, sort, ...filter } = parsed.data;
    const slice = await this.deps.reservations.search({
      ...reservationCriteria(filter),
      sort,
      ...toOffsetLimit({ page, pageSize }),
    });
    const items = await withUserNames(this.deps.users, slice.items);
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
