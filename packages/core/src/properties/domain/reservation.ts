import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { PriceCurrency, PropertyOperationKind } from './property-catalog';
import { optionalText } from './property-details';
import { validCommission, type InvalidCommissionError, type PropertyId } from './property';
import type { ReservationEvent } from './reservation.events';
import { canReservationTransition, type ReservationStatus } from './reservation-status';

export type ReservationId = Id<'Reservation'>;

/** Un monto en centavos con su moneda. */
export interface ReservationAmount {
  readonly cents: bigint;
  readonly currency: PriceCurrency;
}

/** Lo que se edita de una reserva activa. El cliente, la propiedad y la operación no cambian. */
export interface ReservationTerms {
  /** Agente a cargo: usuario de identity, solo por ID. */
  readonly agentUserId: string | undefined;
  /** Sucursal del agente al reservar: de identity, solo por ID. */
  readonly branchId: string | undefined;
  /** Gerente de la reserva (opcional): usuario de identity, solo por ID. */
  readonly managerUserId: string | undefined;
  /** Valor de la reserva (opcional). */
  readonly amount: ReservationAmount | undefined;
  /** Comisión en porcentaje, con hasta dos decimales (opcional; puede ir junto al monto). */
  readonly commissionPct: number | undefined;
  /** Comisión como monto (opcional; puede ir junto al porcentaje). */
  readonly commission: ReservationAmount | undefined;
  /** Fecha estimada de firma (`AAAA-MM-DD`). */
  readonly estimatedSigningDate: string | undefined;
  readonly notes: string | undefined;
}

export interface ReservationSnapshot extends ReservationTerms {
  readonly id: ReservationId;
  readonly propertyId: PropertyId;
  /** Cliente del módulo clients, solo por ID. */
  readonly clientId: string;
  /** Oportunidad del módulo clients, solo por ID (si se reservó desde una destacada). */
  readonly opportunityId: string | undefined;
  readonly operation: PropertyOperationKind;
  readonly status: ReservationStatus;
  readonly reservedAt: Date;
  readonly fallenAt: Date | undefined;
  readonly fallenReason: string | undefined;
  readonly signedAt: Date | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewReservation extends ReservationTerms {
  readonly id: ReservationId;
  readonly propertyId: PropertyId;
  readonly clientId: string;
  readonly opportunityId: string | undefined;
  readonly operation: PropertyOperationKind;
  readonly now: Date;
}

/** Una reserva caída o firmada ya no se edita ni cambia de estado. */
export interface ReservationNotActiveError {
  readonly type: 'ReservationNotActive';
}
export interface NegativeReservationAmountError {
  readonly type: 'NegativeReservationAmount';
}

export type InvalidReservationTermsError = NegativeReservationAmountError | InvalidCommissionError;

function cleanTerms(
  terms: ReservationTerms,
): Result<ReservationTerms, InvalidReservationTermsError> {
  if ((terms.amount?.cents ?? 0n) < 0n || (terms.commission?.cents ?? 0n) < 0n) {
    return err({ type: 'NegativeReservationAmount' });
  }
  if (!validCommission(terms.commissionPct)) return err({ type: 'InvalidCommission' });
  return ok({
    agentUserId: terms.agentUserId,
    branchId: terms.branchId,
    managerUserId: terms.managerUserId,
    amount: terms.amount,
    commissionPct: terms.commissionPct,
    commission: terms.commission,
    estimatedSigningDate: terms.estimatedSigningDate,
    notes: optionalText(terms.notes),
  });
}

function sameAmount(a: ReservationAmount | undefined, b: ReservationAmount | undefined): boolean {
  return a?.cents === b?.cents && a?.currency === b?.currency;
}

function sameTerms(a: ReservationTerms, b: ReservationTerms): boolean {
  return (
    a.agentUserId === b.agentUserId &&
    a.branchId === b.branchId &&
    a.managerUserId === b.managerUserId &&
    sameAmount(a.amount, b.amount) &&
    a.commissionPct === b.commissionPct &&
    sameAmount(a.commission, b.commission) &&
    a.estimatedSigningDate === b.estimatedSigningDate &&
    a.notes === b.notes
  );
}

/**
 * Reserva (seña) de una propiedad por un cliente. Nace activa; se cae (la propiedad vuelve a estar
 * disponible) o se firma (la propiedad pasa a vendida o alquilada). Una propiedad tiene a lo sumo
 * una reserva activa: lo garantizan el estado de la propiedad y un índice único en la base.
 */
export class Reservation extends AggregateRoot<ReservationId, ReservationEvent> {
  #state: Omit<ReservationSnapshot, 'id'>;

  private constructor(id: ReservationId, state: Omit<ReservationSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static create(input: NewReservation): Result<Reservation, InvalidReservationTermsError> {
    const terms = cleanTerms(input);
    if (terms.isErr()) return err(terms.error);
    const reservation = new Reservation(input.id, {
      ...terms.value,
      propertyId: input.propertyId,
      clientId: input.clientId,
      opportunityId: input.opportunityId,
      operation: input.operation,
      status: 'active',
      reservedAt: input.now,
      fallenAt: undefined,
      fallenReason: undefined,
      signedAt: undefined,
      createdAt: input.now,
      updatedAt: input.now,
    });
    reservation.record({
      type: 'properties.reservation_created',
      aggregateId: input.id,
      occurredAt: input.now,
      payload: { ...reservation.#payload(), operation: input.operation },
    });
    return ok(reservation);
  }

  static restore(snapshot: ReservationSnapshot): Reservation {
    const { id, ...state } = snapshot;
    return new Reservation(id, state);
  }

  get propertyId(): PropertyId {
    return this.#state.propertyId;
  }

  get clientId(): string {
    return this.#state.clientId;
  }

  get operation(): PropertyOperationKind {
    return this.#state.operation;
  }

  get status(): ReservationStatus {
    return this.#state.status;
  }

  get isActive(): boolean {
    return this.#state.status === 'active';
  }

  /** Cambia los términos de una reserva activa. Devuelve `false` si no cambió nada. */
  update(
    terms: ReservationTerms,
    now: Date,
  ): Result<boolean, ReservationNotActiveError | InvalidReservationTermsError> {
    if (!this.isActive) return err({ type: 'ReservationNotActive' });
    const cleaned = cleanTerms(terms);
    if (cleaned.isErr()) return err(cleaned.error);
    if (sameTerms(this.#state, cleaned.value)) return ok(false);
    this.#state = { ...this.#state, ...cleaned.value, updatedAt: now };
    this.record({
      type: 'properties.reservation_updated',
      aggregateId: this.id,
      occurredAt: now,
      payload: this.#payload(),
    });
    return ok(true);
  }

  /** La reserva se cae, con un motivo opcional. */
  fall(reason: string | undefined, now: Date): Result<void, ReservationNotActiveError> {
    if (!canReservationTransition(this.#state.status, 'fallen')) {
      return err({ type: 'ReservationNotActive' });
    }
    this.#state = {
      ...this.#state,
      status: 'fallen',
      fallenAt: now,
      fallenReason: optionalText(reason),
      updatedAt: now,
    };
    this.record({
      type: 'properties.reservation_fallen',
      aggregateId: this.id,
      occurredAt: now,
      payload: this.#payload(),
    });
    return ok(undefined);
  }

  /** Se firmó la operación reservada. */
  sign(now: Date): Result<void, ReservationNotActiveError> {
    if (!canReservationTransition(this.#state.status, 'signed')) {
      return err({ type: 'ReservationNotActive' });
    }
    this.#state = { ...this.#state, status: 'signed', signedAt: now, updatedAt: now };
    this.record({
      type: 'properties.reservation_signed',
      aggregateId: this.id,
      occurredAt: now,
      payload: { ...this.#payload(), operation: this.#state.operation },
    });
    return ok(undefined);
  }

  toSnapshot(): ReservationSnapshot {
    return { id: this.id, ...this.#state };
  }

  #payload(): { reservationId: string; propertyId: string; clientId: string } {
    return {
      reservationId: this.id,
      propertyId: this.#state.propertyId,
      clientId: this.#state.clientId,
    };
  }
}
