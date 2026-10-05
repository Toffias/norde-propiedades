import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import {
  HOME_WIDGET_LIMIT,
  SIGNING_WINDOW_DAYS,
  type HomeFilter,
  type HomeWidget,
  type UpcomingSigningRow,
} from '../../contracts';
import { homeScope } from '../home-scope';
import { invalidInput, parseHomeFilter, withAgents, type InvalidInputError } from '../home-support';
import { dayOf, shiftDay } from '../months';
import type { HomeDashboardQuery } from '../ports/home-dashboard-query';
import type { ReportingUserNames } from '../ports/user-names';

export type GetUpcomingSigningsError = ForbiddenError | InvalidInputError;

/**
 * Inicio, "Próximos vencimientos": reservas activas con la firma estimada dentro de los próximos
 * días, incluidas las que ya se pasaron de fecha sin firmarse ni caerse.
 */
export class GetUpcomingSignings {
  constructor(
    private readonly deps: {
      readonly home: HomeDashboardQuery;
      readonly users: ReportingUserNames;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: HomeFilter,
    actor: Actor,
  ): Promise<Result<HomeWidget<UpcomingSigningRow>, GetUpcomingSigningsError>> {
    if (!actor.can('reservations:read') || !actor.can('properties:read')) {
      return err({ type: 'Forbidden' });
    }
    const parsed = parseHomeFilter(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const today = dayOf(this.deps.clock.now());
    const slice = await this.deps.home.activeReservationsSigningUntil(
      homeScope(actor, parsed.data),
      shiftDay(today, SIGNING_WINDOW_DAYS),
      HOME_WIDGET_LIMIT,
    );
    const rows = await withAgents(this.deps.users, slice.items);
    return ok({
      total: slice.total,
      items: rows.map((row) => ({ ...row, overdue: row.estimatedSigningDate < today })),
    });
  }
}
