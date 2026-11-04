import type { CompanySettingsReader } from '../../../settings';
import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  GetPublicSearchFacetsInputSchema,
  PUBLIC_FEATURE_FACET_LIMIT,
  type GetPublicSearchFacetsInput,
  type PublicCountOption,
  type PublicSearchFacets,
} from '../../contracts';
import { countOptionRange, countOptions, type CountFacet } from '../../domain/public-search';
import type { PropertyFilterCriteria, PropertySearchQuery } from '../ports/property-search-query';
import { exchangeRateFor, toPublicFilterCriteria } from '../public-search-criteria';

export type GetPublicSearchFacetsError =
  ForbiddenError | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] };

const RANGE_CRITERIA = {
  rooms: 'roomRanges',
  bedrooms: 'bedroomRanges',
  bathrooms: 'bathroomRanges',
} as const satisfies Record<CountFacet, keyof PropertyFilterCriteria>;

/**
 * Las opciones del buscador de la web con cuántas propiedades daría cada una ("2 ambientes (14)").
 * Ambientes, dormitorios y baños se cuentan sin su propio filtro: se puede elegir más de una
 * opción y cada una muestra cuántas suma.
 */
export class GetPublicSearchFacets {
  constructor(
    private readonly deps: {
      readonly properties: PropertySearchQuery;
      readonly settings?: CompanySettingsReader;
    },
  ) {}

  async execute(
    input: GetPublicSearchFacetsInput,
    actor: Actor,
  ): Promise<Result<PublicSearchFacets, GetPublicSearchFacetsError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });

    const parsed = GetPublicSearchFacetsInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const rate = await exchangeRateFor(parsed.data, this.deps.settings);
    const criteria = toPublicFilterCriteria(parsed.data, rate);

    const counts = async (facet: CountFacet): Promise<PublicCountOption[]> => {
      const options = countOptions(facet);
      const { [RANGE_CRITERIA[facet]]: _own, ...others } = criteria;
      const totals = await this.deps.properties.countByRanges(
        others,
        facet,
        options.map((option) => countOptionRange(facet, option)),
      );
      return options.map((value, index) => ({ value, count: totals[index] ?? 0 }));
    };

    const [rooms, bedrooms, bathrooms, features, flags] = await Promise.all([
      counts('rooms'),
      counts('bedrooms'),
      counts('bathrooms'),
      this.deps.properties.countFeatures(criteria, {
        limit: PUBLIC_FEATURE_FACET_LIMIT,
        includeIds: parsed.data.featureIds ?? [],
      }),
      this.deps.properties.countFlags(criteria),
    ]);
    return ok({ rooms, bedrooms, bathrooms, features, ...flags });
  }
}
