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
  ListCashPeriodsQuerySchema,
  type CashPeriodRow,
  type ListCashPeriodsQuery,
} from '../../contracts';
import { currentCashPeriod } from '../../domain/cash-period';
import { invalidInput, type InvalidInputError } from '../cash-support';
import type { CashQuery } from '../ports/cash-query';

export type ListCashPeriodsError = ForbiddenError | InvalidInputError;

/** Los meses que se pueden consultar de una caja (cerrados y el vigente), con `cash:read`. */
export class ListCashPeriods {
  constructor(private readonly deps: { readonly cash: CashQuery; readonly clock: Clock }) {}

  async execute(
    input: ListCashPeriodsQuery,
    actor: Actor,
  ): Promise<Result<Page<CashPeriodRow>, ListCashPeriodsError>> {
    if (!actor.can('cash:read')) return err({ type: 'Forbidden' });
    const parsed = ListCashPeriodsQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { page, pageSize, sort, box } = parsed.data;
    const slice = await this.deps.cash.periods({
      box,
      current: currentCashPeriod(this.deps.clock.now()),
      sort,
      ...toOffsetLimit({ page, pageSize }),
    });
    return ok(toPage(slice, { page, pageSize }));
  }
}
