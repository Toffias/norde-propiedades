import {
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { CASH_BOXES } from '../../domain/cash-box';
import { currentCashPeriod, nextCashPeriod } from '../../domain/cash-period';
import { syncClosings } from '../cash-support';
import type { CashUnitOfWork } from '../ports/cash-transaction';

/**
 * Cierra, en cada caja, los meses anteriores al vigente que todavía no tienen cierre. Corre la
 * primera vez que alguien abre la caja en el mes nuevo (`cash:read`) y como job a principio de
 * mes. Es idempotente: si dos pedidos llegan juntos, cada mes se cierra una sola vez.
 */
export class CloseCashPeriods {
  constructor(
    private readonly deps: {
      readonly uow: CashUnitOfWork;
      readonly clock: Clock;
      readonly ids: IdGenerator;
    },
  ) {}

  async execute(_input: undefined, actor: Actor): Promise<Result<void, ForbiddenError>> {
    if (!actor.can('cash:read')) return err({ type: 'Forbidden' });
    const now = this.deps.clock.now();
    const current = currentCashPeriod(now);

    for (const box of CASH_BOXES) {
      await this.deps.uow.run(async (tx) => {
        const lastClosed = await tx.closings.lastPeriod(box);
        const from =
          lastClosed === undefined ? await tx.ledger.firstPeriod(box) : nextCashPeriod(lastClosed);
        if (from !== undefined) {
          await syncClosings(tx, { box, from, current, actor, ids: this.deps.ids, now });
        }
      });
    }
    return ok(undefined);
  }
}
