import {
  auditAction,
  diffChanges,
  ErasedClientsInputSchema,
  err,
  ok,
  type Actor,
  type Clock,
  type ErasedClientsInput,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { PropertyClientErasure } from '../ports/property-client-erasure';
import { findProperty, propertyTarget } from '../property-support';

export interface InvalidErasureInputError {
  readonly type: 'InvalidInput';
}

export type UnlinkErasedClientsError = ForbiddenError | InvalidErasureInputError;

/** Cuántas reservas activas se liberan por transacción. */
const ACTIVE_RESERVATIONS_BATCH = 50;

/**
 * Reacción a `clients.client_erased`: el cliente suprimido deja de ser propietario de sus
 * propiedades y contacto comercial de un emprendimiento, y sus reservas se borran. Si una estaba
 * activa, su propiedad vuelve a estar disponible (queda en su historial, sin el cliente). Las
 * propiedades quedan. Idempotente; la constancia de la supresión la deja clients.
 */
export class UnlinkErasedClients {
  constructor(
    private readonly deps: {
      readonly erasure: PropertyClientErasure;
      readonly uow: PropertiesUnitOfWork;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ErasedClientsInput,
    actor: Actor,
  ): Promise<Result<{ readonly unlinked: number }, UnlinkErasedClientsError>> {
    if (!actor.can('properties:erase-client-data')) return err({ type: 'Forbidden' });
    const parsed = ErasedClientsInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'InvalidInput' });
    const { clientIds } = parsed.data;

    let removed = 0;
    for (;;) {
      const released = await this.#releaseActiveReservations(clientIds, actor);
      removed += released;
      if (released < ACTIVE_RESERVATIONS_BATCH) break;
    }
    removed += await this.deps.uow.run((tx) => tx.reservations.deleteByClients(clientIds));
    const unlinked = await this.deps.erasure.unlinkClients(clientIds);
    return ok({ unlinked: unlinked + removed });
  }

  /** Borra un lote de reservas activas y libera sus propiedades. Devuelve cuántas borró. */
  #releaseActiveReservations(clientIds: readonly string[], actor: Actor): Promise<number> {
    const now = this.deps.clock.now();
    return this.deps.uow.run(async (tx) => {
      const active = await tx.reservations.findActiveByClients(
        clientIds,
        ACTIVE_RESERVATIONS_BATCH,
      );
      for (const reservation of active) {
        const property = await findProperty(tx.properties, reservation.propertyId);
        if (property?.releaseReservation(now) === true) {
          await tx.properties.save(property, actor.id);
          await tx.events.publish(property.pullEvents());
          await tx.audit.record(
            auditAction(
              actor,
              propertyTarget('property.reservation_erased', property.id),
              diffChanges({ status: 'reserved' }, { status: property.status }),
            ),
          );
        }
        await tx.reservations.remove(reservation);
      }
      return active.length;
    });
  }
}
