import {
  err,
  ok,
  toOffsetLimit,
  toPage,
  type Actor,
  type ForbiddenError,
  type Page,
  type Result,
} from '../../../shared';
import {
  ListAvailableDevelopmentsQuerySchema,
  type AvailableDevelopmentRow,
  type ListAvailableDevelopmentsQuery,
} from '../../contracts';
import { homeScope } from '../home-scope';
import { invalidInput, withAgents, type InvalidInputError } from '../home-support';
import type { HomeDashboardQuery } from '../ports/home-dashboard-query';
import type { ReportingUserNames } from '../ports/user-names';

export type ListAvailableDevelopmentsError = ForbiddenError | InvalidInputError;

/**
 * Inicio, "Emprendimientos disponibles": los que están en comercialización, paginados en la base,
 * con cuántas unidades disponibles tiene cada uno.
 */
export class ListAvailableDevelopments {
  constructor(
    private readonly deps: {
      readonly home: HomeDashboardQuery;
      readonly users: ReportingUserNames;
    },
  ) {}

  async execute(
    input: ListAvailableDevelopmentsQuery,
    actor: Actor,
  ): Promise<Result<Page<AvailableDevelopmentRow>, ListAvailableDevelopmentsError>> {
    if (!actor.can('developments:read')) return err({ type: 'Forbidden' });
    const parsed = ListAvailableDevelopmentsQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { page, pageSize, sort, ...filter } = parsed.data;
    const slice = await this.deps.home.availableDevelopments(homeScope(actor, filter), {
      sort,
      ...toOffsetLimit({ page, pageSize }),
    });
    const items = await withAgents(this.deps.users, slice.items);
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
