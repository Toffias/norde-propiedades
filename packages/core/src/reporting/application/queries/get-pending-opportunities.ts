import { accessScope, OWNERSHIP_RULES } from '../../../identity';
import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  HOME_WIDGET_LIMIT,
  type HomeFilter,
  type HomeWidget,
  type PendingOpportunityRow,
} from '../../contracts';
import { homeScope } from '../home-scope';
import {
  invalidInput,
  parseHomeFilter,
  PENDING_CONTACT_CATEGORIES,
  withAgents,
  type InvalidInputError,
} from '../home-support';
import type { HomeDashboardQuery } from '../ports/home-dashboard-query';
import type { ReportingUserNames } from '../ports/user-names';

export type GetPendingOpportunitiesError = ForbiddenError | InvalidInputError;

/** Inicio, "Pendientes de contactar": las oportunidades nuevas, la que más espera primero. */
export class GetPendingOpportunities {
  constructor(
    private readonly deps: {
      readonly home: HomeDashboardQuery;
      readonly users: ReportingUserNames;
    },
  ) {}

  async execute(
    input: HomeFilter,
    actor: Actor,
  ): Promise<Result<HomeWidget<PendingOpportunityRow>, GetPendingOpportunitiesError>> {
    if (accessScope(actor, OWNERSHIP_RULES.opportunitiesRead) === undefined) {
      return err({ type: 'Forbidden' });
    }
    const parsed = parseHomeFilter(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const slice = await this.deps.home.opportunitiesInCategories(
      homeScope(actor, parsed.data),
      PENDING_CONTACT_CATEGORIES,
      HOME_WIDGET_LIMIT,
    );
    return ok({ total: slice.total, items: await withAgents(this.deps.users, slice.items) });
  }
}
