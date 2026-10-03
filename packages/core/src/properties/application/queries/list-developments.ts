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
  ListDevelopmentsQuerySchema,
  type DevelopmentRow,
  type ListDevelopmentsQuery,
} from '../../contracts';
import type { DevelopmentListQuery } from '../ports/development-list-query';
import type { UserNames } from '../ports/user-names';

export type ListDevelopmentsError =
  ForbiddenError | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] };

/**
 * Listado de emprendimientos del panel, paginado en la base. Con `developments:read` se ven todos;
 * la papelera la ve quien puede borrar.
 */
export class ListDevelopments {
  constructor(
    private readonly deps: {
      readonly developments: DevelopmentListQuery;
      readonly users: UserNames;
    },
  ) {}

  async execute(
    input: ListDevelopmentsQuery,
    actor: Actor,
  ): Promise<Result<Page<DevelopmentRow>, ListDevelopmentsError>> {
    if (!actor.can('developments:read')) return err({ type: 'Forbidden' });
    const parsed = ListDevelopmentsQuerySchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const query = parsed.data;
    if (query.view === 'trash' && !actor.can('developments:delete')) {
      return err({ type: 'Forbidden' });
    }

    const { page, pageSize } = query;
    const slice = await this.deps.developments.search({
      view: query.view,
      text: query.q,
      status: query.status,
      developmentType: query.developmentType,
      constructionStatus: query.constructionStatus,
      tagId: query.tagId,
      sort: query.sort,
      ...toOffsetLimit({ page, pageSize }),
    });

    const deleters = [
      ...new Set(
        slice.items.flatMap((item) => (item.deletedBy === undefined ? [] : [item.deletedBy])),
      ),
    ];
    const names = await this.deps.users.names(deleters);
    const items = slice.items.map(({ deletedBy, ...item }): DevelopmentRow => ({
      ...item,
      deletedBy:
        deletedBy === undefined ? undefined : { id: deletedBy, name: names.get(deletedBy) },
    }));
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
