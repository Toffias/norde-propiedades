import { err, ok, parseId, type Actor, type ForbiddenError, type Result } from '../../../shared';
import type { PropertyDetail } from '../../contracts';
import { isPubliclyListed } from '../../domain/property-status';
import type { PropertySearchQuery } from '../ports/property-search-query';
import { toPropertyDetail } from '../property-mapper';

export type GetPropertyDetailError = ForbiddenError | { readonly type: 'PropertyNotFound' };

/** Ficha pública de una propiedad. Una propiedad no publicada "no existe" para el público. */
export class GetPropertyDetail {
  constructor(private readonly deps: { readonly properties: PropertySearchQuery }) {}

  async execute(
    input: { readonly propertyId: string },
    actor: Actor,
  ): Promise<Result<PropertyDetail, GetPropertyDetailError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });

    const id = parseId<'Property'>(input.propertyId);
    if (id.isErr()) return err({ type: 'PropertyNotFound' });

    const record = await this.deps.properties.findById(id.value);
    if (!record || !isPubliclyListed(record)) return err({ type: 'PropertyNotFound' });

    return ok(toPropertyDetail(record));
  }
}
