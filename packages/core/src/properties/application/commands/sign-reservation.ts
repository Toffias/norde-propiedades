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
import { SignReservationInputSchema, type SignReservationInput } from '../../contracts';
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

export type SignReservationError =
  | ForbiddenError
  | InvalidInputError
  | ReservationNotFoundError
  | PropertyNotFoundError
  | ReservationNotActiveError;

/**
 * Firma una reserva activa, con `reservations:update`. La propiedad pasa a vendida (venta) o a
 * alquilada (alquiler o temporario) en la misma transacción.
 */
export class SignReservation {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: SignReservationInput,
    actor: Actor,
  ): Promise<Result<void, SignReservationError>> {
    if (!actor.can('reservations:update')) return err({ type: 'Forbidden' });
    const parsed = SignReservationInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, SignReservationError>> => {
      const loaded = await loadReservationForChange(tx, actor, parsed.data.reservationId);
      if (loaded.isErr()) return err(loaded.error);
      const { reservation, property } = loaded.value;

      const before = { ...reservationAuditState(reservation), status: property.status };
      const signed = reservation.sign(now);
      if (signed.isErr()) return err(signed.error);
      property.closeAsSigned(reservation.operation, now);

      await tx.reservations.save(reservation, actor.id);
      await tx.properties.save(property, actor.id);
      await tx.events.publish([...reservation.pullEvents(), ...property.pullEvents()]);
      await tx.audit.record(
        auditAction(
          actor,
          reservationTarget('property.reservation_signed', reservation),
          diffChanges(before, { ...reservationAuditState(reservation), status: property.status }),
        ),
      );
      return ok(undefined);
    });
  }
}
