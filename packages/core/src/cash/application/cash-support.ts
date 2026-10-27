import {
  auditCreated,
  auditUpdated,
  err,
  nextId,
  ok,
  parseId,
  type Actor,
  type AuditState,
  type AuditTarget,
  type IdGenerator,
  type Result,
} from '../../shared';
import { CASH_CURRENCY, type CashBox } from '../domain/cash-box';
import { CashClosing } from '../domain/cash-closing';
import type { CashMovement, CashMovementDetails } from '../domain/cash-movement';
import { nextCashPeriod, type CashPeriod } from '../domain/cash-period';

import type { CashTransaction } from './ports/cash-transaction';

// Lo que comparten los casos de uso de la caja: errores, auditoría y el recálculo de cierres.

export interface CashMovementNotFoundError {
  readonly type: 'CashMovementNotFound';
}
export interface InvalidInputError {
  readonly type: 'InvalidInput';
  readonly issues: readonly string[];
}

/** Un `safeParse` fallido, como error esperado. */
export function invalidInput(error: {
  readonly issues: readonly { readonly message: string }[];
}): InvalidInputError {
  return { type: 'InvalidInput', issues: error.issues.map((issue) => issue.message) };
}

/** Los datos del movimiento tal como los manda el contract. */
export function movementDetails(values: {
  readonly date: string;
  readonly kind: CashMovementDetails['kind'];
  readonly amount: bigint;
  readonly concept: string;
  readonly notes: string | undefined;
}): CashMovementDetails {
  return {
    date: values.date,
    kind: values.kind,
    amountCents: values.amount,
    concept: values.concept,
    notes: values.notes,
  };
}

export async function loadMovement(
  tx: CashTransaction,
  rawId: string,
): Promise<Result<CashMovement, CashMovementNotFoundError>> {
  const id = parseId<'CashMovement'>(rawId);
  const movement = id.isOk() ? await tx.movements.findById(id.value) : undefined;
  return movement === undefined ? err({ type: 'CashMovementNotFound' }) : ok(movement);
}

/** Valores crudos del movimiento para su historial: el monto en centavos con su moneda. */
export function movementAuditState(movement: CashMovement): AuditState {
  const s = movement.toSnapshot();
  return {
    box: s.box,
    date: s.date,
    kind: s.kind,
    amountCents: s.amountCents,
    currency: CASH_CURRENCY,
    concept: s.concept,
    notes: s.notes,
  };
}

export function movementTarget(action: string, movement: CashMovement): AuditTarget {
  return { action, entityType: 'cash_movement', entityId: movement.id, clientIds: [] };
}

function closingAuditState(closing: CashClosing): AuditState {
  const s = closing.toSnapshot();
  return {
    box: s.box,
    period: s.period,
    openingCents: s.openingCents,
    incomeCents: s.incomeCents,
    expenseCents: s.expenseCents,
    closingCents: s.closingCents,
    currency: CASH_CURRENCY,
  };
}

function closingTarget(action: string, closing: CashClosing): AuditTarget {
  return { action, entityType: 'cash_closing', entityId: closing.id, clientIds: [] };
}

/**
 * Deja al día los cierres de la caja desde `from` hasta el mes anterior al vigente: crea los que
 * faltan y recalcula los que cambiaron, cada uno con su entrada de auditoría. Los cierres quedan
 * siempre seguidos, del primer mes con movimientos al anterior al vigente.
 */
export async function syncClosings(
  tx: CashTransaction,
  params: {
    readonly box: CashBox;
    readonly from: CashPeriod;
    readonly current: CashPeriod;
    readonly actor: Actor;
    readonly ids: IdGenerator;
    readonly now: Date;
  },
): Promise<void> {
  const { box, current, actor, now } = params;
  for (let period = params.from; period < current; period = nextCashPeriod(period)) {
    const totals = await tx.ledger.totals(box, period);
    const existing = await tx.closings.findByPeriod(box, period);
    if (existing === undefined) {
      const closed = CashClosing.close({
        id: nextId<'CashClosing'>(params.ids),
        box,
        period,
        current,
        totals,
        actorId: actor.id,
        now,
      });
      if (closed.isErr()) throw new Error(`Cannot close ${box} ${period}: ${closed.error.type}`);
      if (await tx.closings.insertIfMissing(closed.value)) {
        await tx.audit.record(
          auditCreated(
            actor,
            closingTarget('cash_closing.closed', closed.value),
            closingAuditState(closed.value),
          ),
        );
      }
      continue;
    }
    const before = closingAuditState(existing);
    if (!existing.recalculate(totals, now)) continue;
    await tx.closings.save(existing, actor.id);
    const entry = auditUpdated(
      actor,
      closingTarget('cash_closing.recalculated', existing),
      before,
      closingAuditState(existing),
    );
    if (entry !== undefined) await tx.audit.record(entry);
  }
}
