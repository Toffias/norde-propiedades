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
import { ListUsersQuerySchema, type ListUsersQuery, type UserListItem } from '../../contracts';
import type { UserListQuery } from '../ports/user-list-query';

export type ListUsersError =
  ForbiddenError | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] };

/** Usuarios activos o suspendidos, paginados en el servidor. */
export class ListUsers {
  constructor(private readonly deps: { readonly users: UserListQuery }) {}

  async execute(
    input: ListUsersQuery,
    actor: Actor,
  ): Promise<Result<Page<UserListItem>, ListUsersError>> {
    if (!actor.can('users:read')) return err({ type: 'Forbidden' });

    const parsed = ListUsersQuerySchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { page, pageSize, sort, status, q, branchId, teamId } = parsed.data;

    const slice = await this.deps.users.search({
      status,
      text: q,
      branchId,
      teamId,
      sort,
      ...toOffsetLimit({ page, pageSize }),
    });
    return ok(toPage(slice, { page, pageSize }));
  }
}
