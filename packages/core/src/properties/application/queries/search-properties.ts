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
  SearchPropertiesInputSchema,
  type PropertySummary,
  type SearchPropertiesInput,
} from '../../contracts';
import { PUBLICLY_LISTED_STATUSES } from '../../domain/property-status';
import type { PropertySearchQuery } from '../ports/property-search-query';
import { toPropertySummary } from '../property-mapper';

export type SearchPropertiesError =
  ForbiddenError | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] };

/** Busca en el stock que se ofrece al público (web y agente de IA). */
export class SearchProperties {
  constructor(private readonly deps: { readonly properties: PropertySearchQuery }) {}

  async execute(
    input: SearchPropertiesInput,
    actor: Actor,
  ): Promise<Result<Page<PropertySummary>, SearchPropertiesError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });

    const parsed = SearchPropertiesInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { page, pageSize, ...filters } = parsed.data;

    const result = await this.deps.properties.search({
      ...filters,
      statuses: PUBLICLY_LISTED_STATUSES,
      publishedOnWebOnly: true,
      ...toOffsetLimit({ page, pageSize }),
    });

    const items = result.items.map((record) => {
      const summary = toPropertySummary(record, filters.operation);
      // El puerto promete propiedades con operaciones: si no, es un error de la consulta.
      if (!summary)
        throw new Error(`Public search returned property ${record.id} without operations`);
      return summary;
    });
    return ok(toPage({ items, total: result.total }, { page, pageSize }));
  }
}
