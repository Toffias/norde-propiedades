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
import type { CompanySettingsReader } from '../../../settings';
import type { PropertySearchQuery } from '../ports/property-search-query';
import { toPropertySummary } from '../property-mapper';
import { exchangeRateFor, toPublicFilterCriteria } from '../public-search-criteria';

export type SearchPropertiesError =
  ForbiddenError | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] };

/** Busca en el stock que se ofrece al público (web y agente de IA). */
export class SearchProperties {
  constructor(
    private readonly deps: {
      readonly properties: PropertySearchQuery;
      /** La cotización del dólar, para el filtro de precio. Sin ella, no se convierte. */
      readonly settings?: CompanySettingsReader;
    },
  ) {}

  async execute(
    input: SearchPropertiesInput,
    actor: Actor,
  ): Promise<Result<Page<PropertySummary>, SearchPropertiesError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });

    const parsed = SearchPropertiesInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { page, pageSize, sort, ...filters } = parsed.data;
    const rate = await exchangeRateFor(filters, this.deps.settings);

    const result = await this.deps.properties.search({
      ...toPublicFilterCriteria(filters, rate),
      sort,
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
