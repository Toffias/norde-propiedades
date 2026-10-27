import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { CashBox } from './cash-box';
import type { CashPeriod } from './cash-period';

export type CashClosingId = Id<'CashClosing'>;

/** Saldo inicial y movimientos de un mes. El saldo inicial es el acumulado de los meses anteriores. */
export interface CashTotals {
  readonly openingCents: bigint;
  readonly incomeCents: bigint;
  readonly expenseCents: bigint;
}

export function closingBalance(totals: CashTotals): bigint {
  return totals.openingCents + totals.incomeCents - totals.expenseCents;
}

export interface CashClosingSnapshot extends CashTotals {
  readonly id: CashClosingId;
  readonly box: CashBox;
  readonly period: CashPeriod;
  readonly closingCents: bigint;
  readonly closedAt: Date;
  /** Quien entró primero al mes siguiente, o el job de cierre (`system:scheduler`). */
  readonly closedBy: string;
  readonly updatedAt: Date;
}

/** Solo se cierra un mes anterior al vigente. */
export interface CashPeriodNotOverError {
  readonly type: 'CashPeriodNotOver';
}

function sameTotals(a: CashTotals, b: CashTotals): boolean {
  return (
    a.openingCents === b.openingCents &&
    a.incomeCents === b.incomeCents &&
    a.expenseCents === b.expenseCents
  );
}

/**
 * Foto de un mes de una caja al cerrarse: saldo inicial, ingresos, egresos y saldo final. Si
 * después se cambia un movimiento de ese mes o de uno anterior, se recalcula.
 */
export class CashClosing {
  #state: Omit<CashClosingSnapshot, 'id'>;

  private constructor(
    readonly id: CashClosingId,
    state: Omit<CashClosingSnapshot, 'id'>,
  ) {
    this.#state = state;
  }

  static close(input: {
    readonly id: CashClosingId;
    readonly box: CashBox;
    readonly period: CashPeriod;
    readonly current: CashPeriod;
    readonly totals: CashTotals;
    readonly actorId: string;
    readonly now: Date;
  }): Result<CashClosing, CashPeriodNotOverError> {
    if (input.period >= input.current) return err({ type: 'CashPeriodNotOver' });
    return ok(
      new CashClosing(input.id, {
        box: input.box,
        period: input.period,
        ...input.totals,
        closingCents: closingBalance(input.totals),
        closedAt: input.now,
        closedBy: input.actorId,
        updatedAt: input.now,
      }),
    );
  }

  static restore(snapshot: CashClosingSnapshot): CashClosing {
    const { id, ...state } = snapshot;
    return new CashClosing(id, state);
  }

  get box(): CashBox {
    return this.#state.box;
  }

  get period(): CashPeriod {
    return this.#state.period;
  }

  /** Actualiza la foto con los saldos de ahora. Devuelve `false` si no cambió nada. */
  recalculate(totals: CashTotals, now: Date): boolean {
    if (sameTotals(this.#state, totals)) return false;
    this.#state = {
      ...this.#state,
      ...totals,
      closingCents: closingBalance(totals),
      updatedAt: now,
    };
    return true;
  }

  toSnapshot(): CashClosingSnapshot {
    return { id: this.id, ...this.#state };
  }
}
