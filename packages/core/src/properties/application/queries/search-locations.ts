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
  SearchLocationsQuerySchema,
  type SearchLocationsQuery,
  type LocationRow,
} from '../../contracts';
import type { PropertyCatalogQuery } from '../ports/property-catalog-query';

export type SearchLocationsError =
  ForbiddenError | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] };

/** Buscador de ubicaciones del catálogo (alta de propiedades, Mi empresa). Paginado. */
export class SearchLocations {
  constructor(private readonly deps: { readonly catalog: PropertyCatalogQuery }) {}

  async execute(
    input: SearchLocationsQuery,
    actor: Actor,
  ): Promise<Result<Page<LocationRow>, SearchLocationsError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });

    const parsed = SearchLocationsQuerySchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const query = parsed.data;
    const { page, pageSize } = query;
    const slice = await this.deps.catalog.searchLocations({
      text: query.q,
      parentId: query.parentId,
      kind: query.kind,
      ids: query.ids,
      direction: query.sort.direction,
      ...toOffsetLimit({ page, pageSize }),
    });
    return ok(toPage(slice, { page, pageSize }));
  }
}
