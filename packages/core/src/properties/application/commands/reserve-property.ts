import {
  auditAction,
  diffChanges,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { ReservePropertyInputSchema, type ReservePropertyInput } from '../../contracts';
import type {
  OperationNotFoundError,
  PropertyInTrashError,
  PropertyNotAvailableError,
} from '../../domain/property';
import { Reservation, type InvalidReservationTermsError } from '../../domain/reservation';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { Producers } from '../ports/user-names';
import {
  findProperty,
  invalidInput,
  type InvalidInputError,
  type PropertyNotFoundError,
} from '../property-support';
import {
  buildTerms,
  reservationAuditState,
  reservationTarget,
  type AgentNotFoundError,
  type ManagerNotFoundError,
} from '../reservation-support';

/** Otra reserva activa la tomó primero (también entre dos altas al mismo tiempo). */
export interface PropertyAlreadyReservedError {
  readonly type: 'PropertyAlreadyReserved';
}

export type ReservePropertyError =
  | ForbiddenError
  | InvalidInputError
  | PropertyNotFoundError
  | PropertyInTrashError
  | PropertyNotAvailableError
  | OperationNotFoundError
  | PropertyAlreadyReservedError
  | AgentNotFoundError
  | ManagerNotFoundError
  | InvalidReservationTermsError;

/**
 * Reserva una propiedad disponible para un cliente, con `reservations:create`. La propiedad pasa a
 * reservada en la misma transacción. Sin agente elegido, queda a cargo quien reserva.
 */
export class ReserveProperty {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly producers: Producers;
      readonly clock: Clock;
      readonly ids: IdGenerator;
    },
  ) {}

  async execute(
    input: ReservePropertyInput,
    actor: Actor,
  ): Promise<Result<{ readonly reservationId: string }, ReservePropertyError>> {
    if (!actor.can('reservations:create') || !actor.can('properties:read')) {
      return err({ type: 'Forbidden' });
    }
    const parsed = ReservePropertyInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const data = parsed.data;
    const terms = await buildTerms(this.deps.producers, data.agentUserId ?? actor.id, data);
    if (terms.isErr()) return err(terms.error);
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly reservationId: string }, ReservePropertyError>> => {
        const property = await findProperty(tx.properties, data.propertyId);
        if (!property) return err({ type: 'PropertyNotFound' });
        const statusBefore = property.status;
        const marked = property.markAsReserved(data.operation, now);
        if (marked.isErr()) return err(marked.error);

        const created = Reservation.create({
          ...terms.value,
          id: nextId<'Reservation'>(this.deps.ids),
          propertyId: property.id,
          clientId: data.clientId,
          opportunityId: data.opportunityId,
          operation: data.operation,
          now,
        });
        if (created.isErr()) return err(created.error);
        const reservation = created.value;
        if (!(await tx.reservations.insert(reservation, actor.id))) {
          return err({ type: 'PropertyAlreadyReserved' });
        }

        await tx.properties.save(property, actor.id);
        await tx.events.publish([...property.pullEvents(), ...reservation.pullEvents()]);
        await tx.audit.record(
          auditAction(
            actor,
            reservationTarget('property.reserved', reservation),
            diffChanges(
              { status: statusBefore },
              { ...reservationAuditState(reservation), status: property.status },
            ),
          ),
        );
        return ok({ reservationId: reservation.id });
      },
    );
  }
}
