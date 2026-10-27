import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { CashMovementIdInputSchema, type CashMovementIdInput } from '../../contracts';
import type { CashMovementInactiveError } from '../../domain/cash-movement';
import { checkCashPeriodOpen, type CashPeriodClosedError } from '../../domain/cash-period-access';
import { currentCashPeriod, isClosedCashPeriod } from '../../domain/cash-period';
import {
  invalidInput,
  loadMovement,
  movementTarget,
  syncClosings,
  type CashMovementNotFoundError,
  type InvalidInputError,
} from '../cash-support';
import type { CashUnitOfWork } from '../ports/cash-transaction';

/**
 * Solo se anula el último movimiento cargado en el mes de la caja. Si alguien cargó otro mientras
 * tanto, no se anula algo distinto de lo que se confirmó.
 */
export interface NotLastCashMovementError {
  readonly type: 'NotLastCashMovement';
}

export type VoidLastCashMovementError =
  | ForbiddenError
  | InvalidInputError
  | CashMovementNotFoundError
  | CashMovementInactiveError
  | NotLastCashMovementError
  | CashPeriodClosedError;

/**
 * Anula el último movimiento del mes de su caja, con `cash:void`. En un mes cerrado pide además
 * `cash:manage-closed` y recalcula los cierres desde ese mes.
 */
export class VoidLastCashMovement {
  constructor(
    private readonly deps: {
      readonly uow: CashUnitOfWork;
      readonly clock: Clock;
      readonly ids: IdGenerator;
    },
  ) {}

  async execute(
    input: CashMovementIdInput,
    actor: Actor,
  ): Promise<Result<void, VoidLastCashMovementError>> {
    if (!actor.can('cash:void')) return err({ type: 'Forbidden' });
    const parsed = CashMovementIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();
    const current = currentCashPeriod(now);

    return this.deps.uow.run(async (tx): Promise<Result<void, VoidLastCashMovementError>> => {
      const loaded = await loadMovement(tx, parsed.data.movementId);
      if (loaded.isErr()) return err(loaded.error);
      const movement = loaded.value;
      if (!movement.isActive) return err({ type: 'CashMovementInactive' });
      const open = checkCashPeriodOpen([movement.period], current, actor.can('cash:manage-closed'));
      if (open.isErr()) return err(open.error);
      const last = await tx.movements.findLastActive(movement.box, movement.period);
      if (last?.id !== movement.id) return err({ type: 'NotLastCashMovement' });

      const voided = movement.deactivate('voided', actor.id, now);
      if (voided.isErr()) return err(voided.error);
      await tx.movements.save(movement, actor.id);
      await tx.audit.record(auditAction(actor, movementTarget('cash_movement.voided', movement)));
      if (isClosedCashPeriod(movement.period, current)) {
        await syncClosings(tx, {
          box: movement.box,
          from: movement.period,
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
