import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  GetOfferAvailabilityInputSchema,
  type GetOfferAvailabilityInput,
  type OfferAvailability,
  type PropertyOfferAvailability,
} from '../../contracts';
import { isListedOnWeb, isPubliclyListed } from '../../domain/property-status';
import type { PropertySearchQuery, PropertyVisibility } from '../ports/property-search-query';

export type GetOfferAvailabilityError =
  ForbiddenError | { readonly type: 'InvalidInput'; readonly issues: readonly string[] };

/**
 * Si las propiedades que un contacto ya vio se pueden seguir ofreciendo (agente de IA): una que se
 * reservó o se vendió después no se vuelve a ofrecer desde la memoria de la charla.
 */
export class GetOfferAvailability {
  constructor(private readonly deps: { readonly properties: PropertySearchQuery }) {}

  async execute(
    input: GetOfferAvailabilityInput,
    actor: Actor,
  ): Promise<Result<readonly PropertyOfferAvailability[], GetOfferAvailabilityError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });

    const parsed = GetOfferAvailabilityInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const ids = [...new Set(parsed.data.propertyIds.map((id) => id.toLowerCase()))];
    if (ids.length === 0) return ok([]);

    const found = new Map(
      (await this.deps.properties.findVisibility(ids)).map((row) => [row.id.toLowerCase(), row]),
    );
    return ok(
      ids.map((propertyId) => ({
        propertyId,
        availability: availabilityOf(found.get(propertyId)),
      })),
    );
  }
}

function availabilityOf(row: PropertyVisibility | undefined): OfferAvailability {
  if (!row) return 'unavailable';
  if (isPubliclyListed(row)) return 'available';
  return row.status === 'reserved' && isListedOnWeb(row) ? 'reserved' : 'unavailable';
}
