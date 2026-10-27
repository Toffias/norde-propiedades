import {
  err,
  ok,
  toOffsetLimit,
  toPage,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Page,
  type Result,
} from '../../../shared';
import {
  ListCashMovementsQuerySchema,
  type CashMovementRow,
  type ListCashMovementsQuery,
} from '../../contracts';
import { currentCashPeriod } from '../../domain/cash-period';
import { invalidInput, type InvalidInputError } from '../cash-support';
import type { CashQuery, CashUserNames } from '../ports/cash-query';

import type { FutureCashPeriodError } from './get-cash-period';

export type ListCashMovementsError = ForbiddenError | InvalidInputError | FutureCashPeriodError;

/** La planilla de un mes de una caja: los movimientos activos con su saldo, con `cash:read`. */
export class ListCashMovements {
  constructor(
    private readonly deps: {
      readonly cash: CashQuery;
      readonly users: CashUserNames;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ListCashMovementsQuery,
    actor: Actor,
  ): Promise<Result<Page<CashMovementRow>, ListCashMovementsError>> {
    if (!actor.can('cash:read')) return err({ type: 'Forbidden' });
    const parsed = ListCashMovementsQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const current = currentCashPeriod(this.deps.clock.now());
    const { page, pageSize, sort, box, period = current } = parsed.data;
    if (period > current) return err({ type: 'FutureCashPeriod' });

    const slice = await this.deps.cash.movements({
      box,
      period,
      sort,
      ...toOffsetLimit({ page, pageSize }),
    });
    const names = await this.deps.users.names([...new Set(slice.items.map((m) => m.createdBy))]);
    const items = slice.items.map((item) => ({
      ...item,
      createdByName: names.get(item.createdBy),
    }));
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
