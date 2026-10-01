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
  ListFavoriteSearchesQuerySchema,
  type ListFavoriteSearchesQuery,
  type FavoriteSearchRow,
} from '../../contracts';
import type { PropertyCatalogQuery } from '../ports/property-catalog-query';

export type ListFavoriteSearchesError =
  ForbiddenError | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] };

/** Las búsquedas favoritas de quien pregunta. Cada usuario ve solo las suyas. */
export class ListFavoriteSearches {
  constructor(private readonly deps: { readonly catalog: PropertyCatalogQuery }) {}

  async execute(
    input: ListFavoriteSearchesQuery,
    actor: Actor,
  ): Promise<Result<Page<FavoriteSearchRow>, ListFavoriteSearchesError>> {
    if (!actor.can('properties:read') && actor.kind === 'user') return err({ type: 'Forbidden' });

    const parsed = ListFavoriteSearchesQuerySchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const query = parsed.data;
    const { page, pageSize } = query;
    const slice = await this.deps.catalog.listFavoriteSearches({
      userId: actor.id,
      sort: query.sort,
      ...toOffsetLimit({ page, pageSize }),
    });
    return ok(toPage(slice, { page, pageSize }));
  }
}
