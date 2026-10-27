import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { CashBox } from './cash-box';
import { buenosAiresDate, isCashDate, periodOf, type CashPeriod } from './cash-period';

export type CashMovementId = Id<'CashMovement'>;

export const CASH_MOVEMENT_KINDS = ['income', 'expense'] as const;
export type CashMovementKind = (typeof CASH_MOVEMENT_KINDS)[number];

/** `voided`: el último del mes, anulado. `deleted`: borrado con permiso. Ninguno se elimina. */
export const CASH_MOVEMENT_STATUSES = ['active', 'voided', 'deleted'] as const;
export type CashMovementStatus = (typeof CASH_MOVEMENT_STATUSES)[number];

export const MAX_CASH_CONCEPT_LENGTH = 255;
export const MAX_CASH_NOTES_LENGTH = 500;
/** Menos de un billón de pesos, en centavos. */
export const MAX_CASH_AMOUNT_CENTS = 100_000_000_000_000n;

/** Lo que se carga y se edita de un movimiento. */
export interface CashMovementDetails {
  /** Día de Buenos Aires, `AAAA-MM-DD`. Define el mes del movimiento. */
  readonly date: string;
  readonly kind: CashMovementKind;
  /** Pesos, en centavos. Siempre positivo: el signo lo da `kind`. */
  readonly amountCents: bigint;
  readonly concept: string;
  readonly notes: string | undefined;
}

export interface CashMovementSnapshot extends CashMovementDetails {
  readonly id: CashMovementId;
  readonly box: CashBox;
  readonly status: CashMovementStatus;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly voidedAt: Date | undefined;
  readonly voidedBy: string | undefined;
}

export interface InvalidCashDateError {
  readonly type: 'InvalidCashDate';
}
export interface FutureCashDateError {
  readonly type: 'FutureCashDate';
}
export interface InvalidCashAmountError {
  readonly type: 'InvalidCashAmount';
}
export interface CashConceptRequiredError {
  readonly type: 'CashConceptRequired';
}
export interface CashTextTooLongError {
  readonly type: 'CashTextTooLong';
  readonly field: 'concept' | 'notes';
}
/** Un movimiento anulado o borrado ya no se cambia. */
export interface CashMovementInactiveError {
  readonly type: 'CashMovementInactive';
}

export type InvalidCashMovementError =
  | InvalidCashDateError
  | FutureCashDateError
  | InvalidCashAmountError
  | CashConceptRequiredError
  | CashTextTooLongError;

function cleanDetails(
  details: CashMovementDetails,
  now: Date,
): Result<CashMovementDetails, InvalidCashMovementError> {
  if (!isCashDate(details.date)) return err({ type: 'InvalidCashDate' });
  if (details.date > buenosAiresDate(now)) return err({ type: 'FutureCashDate' });
  if (details.amountCents <= 0n || details.amountCents >= MAX_CASH_AMOUNT_CENTS) {
    return err({ type: 'InvalidCashAmount' });
  }
  const concept = details.concept.trim().replace(/\s+/g, ' ');
  if (concept === '') return err({ type: 'CashConceptRequired' });
  if (concept.length > MAX_CASH_CONCEPT_LENGTH) {
    return err({ type: 'CashTextTooLong', field: 'concept' });
  }
  const trimmedNotes = details.notes?.trim();
  const notes = trimmedNotes === '' ? undefined : trimmedNotes;
  if (notes !== undefined && notes.length > MAX_CASH_NOTES_LENGTH) {
    return err({ type: 'CashTextTooLong', field: 'notes' });
  }
  return ok({
    date: details.date,
    kind: details.kind,
    amountCents: details.amountCents,
    concept,
    notes,
  });
}

function sameDetails(a: CashMovementDetails, b: CashMovementDetails): boolean {
  return (
    a.date === b.date &&
    a.kind === b.kind &&
    a.amountCents === b.amountCents &&
    a.concept === b.concept &&
    a.notes === b.notes
  );
}

/**
 * Ingreso o egreso de una caja. Anularlo o borrarlo no lo elimina: queda inactivo y deja de
 * sumar al saldo. Cuándo se puede cambiar según el mes lo decide `checkCashPeriodOpen`.
 */
export class CashMovement extends AggregateRoot<CashMovementId> {
  #state: Omit<CashMovementSnapshot, 'id'>;

  private constructor(id: CashMovementId, state: Omit<CashMovementSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static create(input: {
    readonly id: CashMovementId;
    readonly box: CashBox;
    readonly details: CashMovementDetails;
    readonly actorId: string;
    readonly now: Date;
  }): Result<CashMovement, InvalidCashMovementError> {
    const details = cleanDetails(input.details, input.now);
    if (details.isErr()) return err(details.error);
    return ok(
      new CashMovement(input.id, {
        ...details.value,
        box: input.box,
        status: 'active',
        createdAt: input.now,
        createdBy: input.actorId,
        updatedAt: input.now,
        voidedAt: undefined,
        voidedBy: undefined,
      }),
    );
  }

  static restore(snapshot: CashMovementSnapshot): CashMovement {
    const { id, ...state } = snapshot;
    return new CashMovement(id, state);
  }

  get box(): CashBox {
    return this.#state.box;
  }

  get period(): CashPeriod {
    return periodOf(this.#state.date);
  }

  get status(): CashMovementStatus {
    return this.#state.status;
  }

  get isActive(): boolean {
    return this.#state.status === 'active';
  }

  /**
   * Cambia los datos. Devuelve `false` si quedaron iguales. Puede mover el movimiento a otro mes:
   * el caso de uso controla los dos meses.
   */
  update(
    details: CashMovementDetails,
    now: Date,
  ): Result<boolean, InvalidCashMovementError | CashMovementInactiveError> {
    if (!this.isActive) return err({ type: 'CashMovementInactive' });
    const clean = cleanDetails(details, now);
    if (clean.isErr()) return err(clean.error);
    if (sameDetails(this.#state, clean.value)) return ok(false);
    this.#state = { ...this.#state, ...clean.value, updatedAt: now };
    return ok(true);
  }

  /** Anula (el último del mes) o borra (cualquiera, con permiso). */
  deactivate(
    status: 'voided' | 'deleted',
    actorId: string,
    now: Date,
  ): Result<void, CashMovementInactiveError> {
    if (!this.isActive) return err({ type: 'CashMovementInactive' });
    this.#state = { ...this.#state, status, voidedAt: now, voidedBy: actorId, updatedAt: now };
    return ok(undefined);
  }

  toSnapshot(): CashMovementSnapshot {
    return { id: this.id, ...this.#state };
  }
}
