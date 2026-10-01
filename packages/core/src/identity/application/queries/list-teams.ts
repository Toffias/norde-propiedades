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
import { ListTeamsQuerySchema, type ListTeamsQuery, type TeamListItem } from '../../contracts';
import type { OrganizationQuery } from '../ports/organization-query';

export type ListTeamsError =
  ForbiddenError | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] };

/** Equipos paginados (con la cantidad de miembros), o su papelera. */
export class ListTeams {
  constructor(private readonly deps: { readonly organization: OrganizationQuery }) {}

  async execute(
    input: ListTeamsQuery,
    actor: Actor,
  ): Promise<Result<Page<TeamListItem>, ListTeamsError>> {
    if (!actor.can('teams:read')) return err({ type: 'Forbidden' });

    const parsed = ListTeamsQuerySchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { page, pageSize, sort, q, view, branchId } = parsed.data;
    if (view === 'trash' && !actor.can('teams:delete')) return err({ type: 'Forbidden' });

    const slice = await this.deps.organization.searchTeams({
      view,
      text: q,
      branchId,
      sort,
      ...toOffsetLimit({ page, pageSize }),
    });
    return ok(toPage(slice, { page, pageSize }));
  }
}
