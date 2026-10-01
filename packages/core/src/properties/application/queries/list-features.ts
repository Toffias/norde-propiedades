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
import { ListFeaturesQuerySchema, type ListFeaturesQuery, type FeatureRow } from '../../contracts';
import type { PropertyCatalogQuery } from '../ports/property-catalog-query';

export type ListFeaturesError =
  ForbiddenError | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] };

/** Servicios, ambientes o adicionales del catálogo, de a un tipo por vez. */
export class ListFeatures {
  constructor(private readonly deps: { readonly catalog: PropertyCatalogQuery }) {}

  async execute(
    input: ListFeaturesQuery,
    actor: Actor,
  ): Promise<Result<Page<FeatureRow>, ListFeaturesError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });

    const parsed = ListFeaturesQuerySchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const query = parsed.data;
    const { page, pageSize } = query;
    const slice = await this.deps.catalog.listFeatures({
      kind: query.kind,
      text: query.q,
      active: query.state === 'all' ? undefined : query.state === 'active',
      sort: query.sort,
      ...toOffsetLimit({ page, pageSize }),
    });
    return ok(toPage(slice, { page, pageSize }));
  }
}
