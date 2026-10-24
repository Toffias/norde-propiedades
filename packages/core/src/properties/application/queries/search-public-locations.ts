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
  SearchPublicLocationsInputSchema,
  type PublicLocation,
  type SearchPublicLocationsInput,
} from '../../contracts';
import { locationContext } from '../../domain/location';
import { PUBLICLY_LISTED_STATUSES } from '../../domain/property-status';
import type { PublicLocationQuery } from '../ports/public-location-query';

export type SearchPublicLocationsError =
  ForbiddenError | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] };

/**
 * Barrios y localidades del catálogo para el buscador de la web: solo los que tienen propiedades
 * publicadas, así nadie elige una zona vacía y todos buscan por el mismo nombre.
 */
export class SearchPublicLocations {
  constructor(private readonly deps: { readonly locations: PublicLocationQuery }) {}

  async execute(
    input: SearchPublicLocationsInput,
    actor: Actor,
  ): Promise<Result<Page<PublicLocation>, SearchPublicLocationsError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });

    const parsed = SearchPublicLocationsInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { q, ids, page, pageSize } = parsed.data;
    const slice = await this.deps.locations.search({
      text: q,
      ids,
      statuses: PUBLICLY_LISTED_STATUSES,
      ...toOffsetLimit({ page, pageSize }),
    });
    const items = slice.items.map((record): PublicLocation => ({
      id: record.id,
      kind: record.kind,
      name: record.name,
      context: locationContext(record.name, record.ancestors),
      listingCount: record.listingCount,
    }));
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
