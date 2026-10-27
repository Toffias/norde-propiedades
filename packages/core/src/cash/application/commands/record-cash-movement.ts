import {
  auditCreated,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { RecordCashMovementInputSchema, type RecordCashMovementInput } from '../../contracts';
import { CashMovement, type InvalidCashMovementError } from '../../domain/cash-movement';
import { checkCashPeriodOpen, type CashPeriodClosedError } from '../../domain/cash-period-access';
import { currentCashPeriod, isClosedCashPeriod } from '../../domain/cash-period';
import {
  invalidInput,
  movementAuditState,
  movementDetails,
  movementTarget,
  syncClosings,
  type InvalidInputError,
} from '../cash-support';
import type { CashUnitOfWork } from '../ports/cash-transaction';

export type RecordCashMovementError =
  ForbiddenError | InvalidInputError | InvalidCashMovementError | CashPeriodClosedError;

/**
 * Carga un ingreso o un egreso, con `cash:create`. En un mes cerrado pide además
 * `cash:manage-closed`, y recalcula los cierres desde ese mes.
 */
export class RecordCashMovement {
  constructor(
    private readonly deps: {
      readonly uow: CashUnitOfWork;
      readonly clock: Clock;
      readonly ids: IdGenerator;
    },
  ) {}

  async execute(
    input: RecordCashMovementInput,
    actor: Actor,
  ): Promise<Result<{ readonly movementId: string }, RecordCashMovementError>> {
    if (!actor.can('cash:create')) return err({ type: 'Forbidden' });
    const parsed = RecordCashMovementInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();
    const current = currentCashPeriod(now);

    const created = CashMovement.create({
      id: nextId<'CashMovement'>(this.deps.ids),
      box: parsed.data.box,
      details: movementDetails(parsed.data),
      actorId: actor.id,
      now,
    });
    if (created.isErr()) return err(created.error);
    const movement = created.value;
    const open = checkCashPeriodOpen([movement.period], current, actor.can('cash:manage-closed'));
    if (open.isErr()) return err(open.error);

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly movementId: string }, RecordCashMovementError>> => {
        await tx.movements.insert(movement, actor.id);
        await tx.audit.record(
          auditCreated(
            actor,
            movementTarget('cash_movement.recorded', movement),
            movementAuditState(movement),
          ),
        );
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
        return ok({ movementId: movement.id });
      },
    );
  }
}
