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
  ListAvailablePropertiesQuerySchema,
  type AvailablePropertyRow,
  type ListAvailablePropertiesQuery,
} from '../../contracts';
import { homeScope } from '../home-scope';
import { invalidInput, withAgents, type InvalidInputError } from '../home-support';
import type { HomeDashboardQuery } from '../ports/home-dashboard-query';
import type { ReportingUserNames } from '../ports/user-names';

export type ListAvailablePropertiesError = ForbiddenError | InvalidInputError;

/** Inicio, "Propiedades disponibles": paginadas en la base, con el alcance de quien mira. */
export class ListAvailableProperties {
  constructor(
    private readonly deps: {
      readonly home: HomeDashboardQuery;
      readonly users: ReportingUserNames;
    },
  ) {}

  async execute(
    input: ListAvailablePropertiesQuery,
    actor: Actor,
  ): Promise<Result<Page<AvailablePropertyRow>, ListAvailablePropertiesError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });
    const parsed = ListAvailablePropertiesQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { page, pageSize, sort, ...filter } = parsed.data;
    const slice = await this.deps.home.availableProperties(homeScope(actor, filter), {
      sort,
      ...toOffsetLimit({ page, pageSize }),
    });
    const items = await withAgents(this.deps.users, slice.items);
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
