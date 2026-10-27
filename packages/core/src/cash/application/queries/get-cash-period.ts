import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import {
  CashPeriodQuerySchema,
  type CashPeriodQuery,
  type CashPeriodSummary,
} from '../../contracts';
import { closingBalance } from '../../domain/cash-closing';
import { currentCashPeriod, isClosedCashPeriod } from '../../domain/cash-period';
import { invalidInput, type InvalidInputError } from '../cash-support';
import type { CashUnitOfWork } from '../ports/cash-transaction';

/** Un mes posterior al vigente no existe todavía. */
export interface FutureCashPeriodError {
  readonly type: 'FutureCashPeriod';
}

export type GetCashPeriodError = ForbiddenError | InvalidInputError | FutureCashPeriodError;

/** El encabezado de un mes de una caja (el vigente si no se pide otro), con `cash:read`. */
export class GetCashPeriod {
  constructor(private readonly deps: { readonly uow: CashUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: CashPeriodQuery,
    actor: Actor,
  ): Promise<Result<CashPeriodSummary, GetCashPeriodError>> {
    if (!actor.can('cash:read')) return err({ type: 'Forbidden' });
    const parsed = CashPeriodQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const current = currentCashPeriod(this.deps.clock.now());
    const { box, period = current } = parsed.data;
    if (period > current) return err({ type: 'FutureCashPeriod' });
    const writable = !isClosedCashPeriod(period, current) || actor.can('cash:manage-closed');

    return this.deps.uow.run(async (tx): Promise<Result<CashPeriodSummary, GetCashPeriodError>> => {
      const [totals, closing, last] = await Promise.all([
        tx.ledger.totals(box, period),
        tx.closings.findByPeriod(box, period),
        tx.movements.findLastActive(box, period),
      ]);
      return ok({
        box,
        period,
        currentPeriod: current,
        ...totals,
        closingCents: closingBalance(totals),
        closedAt: closing?.toSnapshot().closedAt,
        lastMovementId: last?.id,
        can: {
          create: writable && actor.can('cash:create'),
          update: writable && actor.can('cash:update'),
          void: writable && actor.can('cash:void'),
          delete: actor.can('cash:delete'),
        },
      });
    });
  }
}
