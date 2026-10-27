import {
  auditUpdated,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { UpdateCashMovementInputSchema, type UpdateCashMovementInput } from '../../contracts';
import type {
  CashMovementInactiveError,
  InvalidCashMovementError,
} from '../../domain/cash-movement';
import { checkCashPeriodOpen, type CashPeriodClosedError } from '../../domain/cash-period-access';
import { currentCashPeriod, isClosedCashPeriod } from '../../domain/cash-period';
import {
  invalidInput,
  loadMovement,
  movementAuditState,
  movementDetails,
  movementTarget,
  syncClosings,
  type CashMovementNotFoundError,
  type InvalidInputError,
} from '../cash-support';
import type { CashUnitOfWork } from '../ports/cash-transaction';

export type UpdateCashMovementError =
  | ForbiddenError
  | InvalidInputError
  | CashMovementNotFoundError
  | CashMovementInactiveError
  | InvalidCashMovementError
  | CashPeriodClosedError;

/**
 * Edita un movimiento activo, con `cash:update`. Si estaba o queda en un mes cerrado, pide además
 * `cash:manage-closed` y recalcula los cierres desde el más viejo de los dos meses.
 */
export class UpdateCashMovement {
  constructor(
    private readonly deps: {
      readonly uow: CashUnitOfWork;
      readonly clock: Clock;
      readonly ids: IdGenerator;
    },
  ) {}

  async execute(
    input: UpdateCashMovementInput,
    actor: Actor,
  ): Promise<Result<void, UpdateCashMovementError>> {
    if (!actor.can('cash:update')) return err({ type: 'Forbidden' });
    const parsed = UpdateCashMovementInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();
    const current = currentCashPeriod(now);
    const allowClosed = actor.can('cash:manage-closed');

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdateCashMovementError>> => {
      const loaded = await loadMovement(tx, parsed.data.movementId);
      if (loaded.isErr()) return err(loaded.error);
      const movement = loaded.value;
      const periodBefore = movement.period;
      const wasOpen = checkCashPeriodOpen([periodBefore], current, allowClosed);
      if (wasOpen.isErr()) return err(wasOpen.error);

      const before = movementAuditState(movement);
      const updated = movement.update(movementDetails(parsed.data), now);
      if (updated.isErr()) return err(updated.error);
      if (!updated.value) return ok(undefined);
      const isOpen = checkCashPeriodOpen([movement.period], current, allowClosed);
      if (isOpen.isErr()) return err(isOpen.error);

      await tx.movements.save(movement, actor.id);
      const entry = auditUpdated(
        actor,
        movementTarget('cash_movement.updated', movement),
        before,
        movementAuditState(movement),
      );
      if (entry !== undefined) await tx.audit.record(entry);
      const from = periodBefore < movement.period ? periodBefore : movement.period;
      if (isClosedCashPeriod(from, current)) {
        await syncClosings(tx, {
          box: movement.box,
          from,
          current,
          actor,
          ids: this.deps.ids,
          now,
        });
      }
      return ok(undefined);
    });
  }
}
