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
  ListBranchesQuerySchema,
  type BranchListItem,
  type ListBranchesQuery,
} from '../../contracts';
import type { OrganizationQuery } from '../ports/organization-query';

export type ListBranchesError =
  ForbiddenError | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] };

/**
 * Sucursales paginadas, o su papelera. Las ve quien las administra y quien da de alta o edita
 * usuarios (les elige la sucursal).
 */
export class ListBranches {
  constructor(private readonly deps: { readonly organization: OrganizationQuery }) {}

  async execute(
    input: ListBranchesQuery,
    actor: Actor,
  ): Promise<Result<Page<BranchListItem>, ListBranchesError>> {
    const allowed =
      actor.can('branches:read') || actor.can('users:create') || actor.can('users:update');
    if (!allowed) return err({ type: 'Forbidden' });

    const parsed = ListBranchesQuerySchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { page, pageSize, sort, q, view } = parsed.data;
    if (view === 'trash' && !actor.can('branches:delete')) return err({ type: 'Forbidden' });

    const slice = await this.deps.organization.searchBranches({
      view,
      text: q,
      sort,
      ...toOffsetLimit({ page, pageSize }),
    });
    return ok(toPage(slice, { page, pageSize }));
  }
}
