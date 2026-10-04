import {
  auditAction,
  diffChanges,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { FallReservationInputSchema, type FallReservationInput } from '../../contracts';
import type { ReservationNotActiveError } from '../../domain/reservation';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  invalidInput,
  type InvalidInputError,
  type PropertyNotFoundError,
} from '../property-support';
import {
  loadReservationForChange,
  reservationAuditState,
  reservationTarget,
  type ReservationNotFoundError,
} from '../reservation-support';

export type FallReservationError =
  | ForbiddenError
  | InvalidInputError
  | ReservationNotFoundError
  | PropertyNotFoundError
  | ReservationNotActiveError;

/**
 * Da por caída una reserva activa, con `reservations:update` y un motivo opcional. La propiedad
 * vuelve a estar disponible en la misma transacción.
 */
export class FallReservation {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: FallReservationInput,
    actor: Actor,
  ): Promise<Result<void, FallReservationError>> {
    if (!actor.can('reservations:update')) return err({ type: 'Forbidden' });
    const parsed = FallReservationInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { reservationId, reason } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, FallReservationError>> => {
      const loaded = await loadReservationForChange(tx, actor, reservationId);
      if (loaded.isErr()) return err(loaded.error);
      const { reservation, property } = loaded.value;

      const before = { ...reservationAuditState(reservation), status: property.status };
      const fallen = reservation.fall(reason, now);
      if (fallen.isErr()) return err(fallen.error);
      property.releaseReservation(now);

      await tx.reservations.save(reservation, actor.id);
      await tx.properties.save(property, actor.id);
      await tx.events.publish([...reservation.pullEvents(), ...property.pullEvents()]);
      await tx.audit.record(
        auditAction(
          actor,
          reservationTarget('property.reservation_fallen', reservation),
          diffChanges(before, { ...reservationAuditState(reservation), status: property.status }),
        ),
      );
      return ok(undefined);
    });
  }
}
