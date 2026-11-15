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
import { UpdateReservationInputSchema, type UpdateReservationInput } from '../../contracts';
import type {
  InvalidReservationTermsError,
  ReservationClientLockedError,
  ReservationNotActiveError,
} from '../../domain/reservation';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { Producers } from '../ports/user-names';
import {
  invalidInput,
  type InvalidInputError,
  type PropertyNotFoundError,
} from '../property-support';
import {
  buildTerms,
  checkReservationClient,
  loadReservationForChange,
  reservationAuditState,
  reservationTarget,
  type AgentNotFoundError,
  type ManagerNotFoundError,
  type ReservationClientNotFoundError,
  type ReservationNotFoundError,
} from '../reservation-support';

export type UpdateReservationError =
  | ForbiddenError
  | InvalidInputError
  | ReservationNotFoundError
  | PropertyNotFoundError
  | ReservationNotActiveError
  | AgentNotFoundError
  | ManagerNotFoundError
  | InvalidReservationTermsError
  | ReservationClientNotFoundError
  | ReservationClientLockedError;

/**
 * Edita una reserva activa (contacto, valor, comisión, fecha estimada, agente, gerente y notas), con
 * `reservations:update`. El contacto se carga si se reservó sin él, o se cambia (sin valor, queda el
 * que tenía); si la reserva está atada a una oportunidad, no cambia. La operación no cambia: para eso se cae y se reserva de nuevo.
 */
export class UpdateReservation {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly producers: Producers;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: UpdateReservationInput,
    actor: Actor,
  ): Promise<Result<void, UpdateReservationError>> {
    if (!actor.can('reservations:update')) return err({ type: 'Forbidden' });
    const parsed = UpdateReservationInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const data = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdateReservationError>> => {
      const loaded = await loadReservationForChange(tx, actor, data.reservationId);
      if (loaded.isErr()) return err(loaded.error);
      const { reservation } = loaded.value;
      if (!reservation.isActive) return err({ type: 'ReservationNotActive' });

      const current = reservation.toSnapshot();
      const agentUserId = data.agentUserId ?? current.agentUserId ?? actor.id;
      const terms = await buildTerms(this.deps.producers, agentUserId, data, current);
      if (terms.isErr()) return err(terms.error);
      const clientId = data.clientId ?? current.clientId;
      if (clientId !== undefined && clientId !== current.clientId) {
        const client = await checkReservationClient(tx.reservationParties, actor, clientId);
        if (client.isErr()) return err(client.error);
      }

      const before = reservationAuditState(reservation);
      const changed = reservation.update({ ...terms.value, clientId }, now);
      if (changed.isErr()) return err(changed.error);
      if (!changed.value) return ok(undefined);

      await tx.reservations.save(reservation, actor.id);
      await tx.events.publish(reservation.pullEvents());
      await tx.audit.record(
        auditAction(
          actor,
          reservationTarget('property.reservation_updated', reservation, current.clientId),
          diffChanges(before, reservationAuditState(reservation)),
        ),
      );
      return ok(undefined);
    });
  }
}
