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
  ListTagGroupsQuerySchema,
  type ListTagGroupsQuery,
  type TagGroupRow,
} from '../../contracts';
import type { PropertyCatalogQuery } from '../ports/property-catalog-query';

export type ListTagGroupsError =
  ForbiddenError | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] };

/** Grupos de etiquetas de propiedades, con cuántas etiquetas tiene cada uno. */
export class ListTagGroups {
  constructor(private readonly deps: { readonly catalog: PropertyCatalogQuery }) {}

  async execute(
    input: ListTagGroupsQuery,
    actor: Actor,
  ): Promise<Result<Page<TagGroupRow>, ListTagGroupsError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });

    const parsed = ListTagGroupsQuerySchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const query = parsed.data;
    const { page, pageSize } = query;
    const slice = await this.deps.catalog.listTagGroups({
      text: query.q,
      sort: query.sort,
      ...toOffsetLimit({ page, pageSize }),
    });
    return ok(toPage(slice, { page, pageSize }));
  }
}
