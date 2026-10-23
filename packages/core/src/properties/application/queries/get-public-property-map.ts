import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  GetPublicPropertyMapInputSchema,
  MAX_PUBLIC_MAP_PINS,
  type GetPublicPropertyMapInput,
  type PublicMapPin,
  type PublicMapResult,
} from '../../contracts';
import { PUBLICLY_LISTED_STATUSES } from '../../domain/property-status';
import { publicCoordinates } from '../../domain/public-listing';
import type { PropertySearchQuery } from '../ports/property-search-query';
import { toPropertySummary } from '../property-mapper';

export type GetPublicPropertyMapError =
  ForbiddenError | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] };

/**
 * Pines del mapa del listado de la web: las propiedades publicadas con coordenadas que cumplen
 * los filtros. Cada pin va donde lo pone la ficha: exacto o aproximado a la manzana.
 */
export class GetPublicPropertyMap {
  constructor(private readonly deps: { readonly properties: PropertySearchQuery }) {}

  async execute(
    input: GetPublicPropertyMapInput,
    actor: Actor,
  ): Promise<Result<PublicMapResult, GetPublicPropertyMapError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });

    const parsed = GetPublicPropertyMapInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const result = await this.deps.properties.search({
      ...parsed.data,
      statuses: PUBLICLY_LISTED_STATUSES,
      publishedOnWebOnly: true,
      withCoordinates: true,
      sort: 'featured',
      offset: 0,
      limit: MAX_PUBLIC_MAP_PINS,
    });

    const pins = result.items.flatMap((record): PublicMapPin[] => {
      const coordinates = publicCoordinates(record);
      const summary = toPropertySummary(record, parsed.data.operation);
      if (!coordinates || !summary) return [];
      return [
        {
          id: summary.id,
          slug: summary.slug,
          title: summary.title,
          propertyType: summary.propertyType,
          operation: summary.operation,
          price: summary.price,
          coordinates,
          cover: summary.cover,
          rooms: summary.rooms,
          surfaceTotalM2: summary.surfaceTotalM2,
          surfaceCoveredM2: summary.surfaceCoveredM2,
          neighborhood: summary.neighborhood,
          city: summary.city,
        },
      ];
    });
    return ok({ pins, total: result.total, truncated: result.total > pins.length });
  }
}
