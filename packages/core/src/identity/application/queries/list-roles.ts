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
import { ListRolesQuerySchema, type ListRolesQuery, type RoleListItem } from '../../contracts';
import type { RoleListQuery } from '../ports/role-list-query';

export type ListRolesError =
  ForbiddenError | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] };

/**
 * Roles con la cantidad de usuarios de cada uno, paginados. Los ve quien administra roles y quien
 * da de alta o edita usuarios (tiene que elegirles un rol).
 */
export class ListRoles {
  constructor(private readonly deps: { readonly roles: RoleListQuery }) {}

  async execute(
    input: ListRolesQuery,
    actor: Actor,
  ): Promise<Result<Page<RoleListItem>, ListRolesError>> {
    const allowed =
      actor.can('roles:read') || actor.can('users:create') || actor.can('users:update');
    if (!allowed) return err({ type: 'Forbidden' });

    const parsed = ListRolesQuerySchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { page, pageSize, sort, q, view } = parsed.data;

    // La papelera es de quien puede borrar y restaurar roles.
    if (view === 'trash' && !actor.can('roles:delete')) return err({ type: 'Forbidden' });

    const slice = await this.deps.roles.search({
      view,
      text: q,
      sort,
      ...toOffsetLimit({ page, pageSize }),
    });
    return ok(toPage(slice, { page, pageSize }));
  }
}
