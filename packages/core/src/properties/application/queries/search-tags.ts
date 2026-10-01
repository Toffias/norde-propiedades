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
  NO_TAG_GROUP,
  SearchTagsQuerySchema,
  type SearchTagsQuery,
  type TagRow,
} from '../../contracts';
import type { PropertyCatalogQuery } from '../ports/property-catalog-query';

export type SearchTagsError =
  ForbiddenError | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] };

/** Etiquetas de propiedades por nombre o por grupo, con cuántas propiedades la usan. */
export class SearchTags {
  constructor(private readonly deps: { readonly catalog: PropertyCatalogQuery }) {}

  async execute(
    input: SearchTagsQuery,
    actor: Actor,
  ): Promise<Result<Page<TagRow>, SearchTagsError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });

    const parsed = SearchTagsQuerySchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const query = parsed.data;
    const { page, pageSize } = query;
    const slice = await this.deps.catalog.searchTags({
      text: query.q,
      groupId: query.group === NO_TAG_GROUP ? null : query.group,
      direction: query.sort.direction,
      ...toOffsetLimit({ page, pageSize }),
    });
    return ok(toPage(slice, { page, pageSize }));
  }
}
