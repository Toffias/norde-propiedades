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

export type DeleteCashMovementError =
  ForbiddenError | InvalidInputError | CashMovementNotFoundError | CashMovementInactiveError;

/**
 * Borra cualquier movimiento activo, de cualquier mes, con `cash:delete`. Es una baja lógica: deja
 * de sumar al saldo. En un mes cerrado recalcula los cierres desde ese mes.
 */
export class DeleteCashMovement {
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
  ): Promise<Result<void, DeleteCashMovementError>> {
    if (!actor.can('cash:delete')) return err({ type: 'Forbidden' });
    const parsed = CashMovementIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();
    const current = currentCashPeriod(now);

    return this.deps.uow.run(async (tx): Promise<Result<void, DeleteCashMovementError>> => {
      const loaded = await loadMovement(tx, parsed.data.movementId);
      if (loaded.isErr()) return err(loaded.error);
      const movement = loaded.value;

      const deleted = movement.deactivate('deleted', actor.id, now);
      if (deleted.isErr()) return err(deleted.error);
      await tx.movements.save(movement, actor.id);
      await tx.audit.record(auditAction(actor, movementTarget('cash_movement.deleted', movement)));
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
