import type { FollowUpListingProfile } from '../../../clients';
import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import { PropertyIdInputSchema, type PropertyIdInput } from '../../contracts';
import { isPubliclyListed } from '../../domain/property-status';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  findProperty,
  invalidInput,
  type InvalidInputError,
  type PropertyNotFoundError,
} from '../property-support';

import { interestProfileOf } from './get-property-interest-profile';

export type GetPropertyFollowUpProfileError =
  ForbiddenError | InvalidInputError | PropertyNotFoundError;

/**
 * Lo que el cruce de los seguimientos automáticos (#106) lee de una propiedad: su perfil de cruce,
 * si el sitio la muestra y desde cuándo está disponible. Una en la papelera no existe.
 */
export class GetPropertyFollowUpProfile {
  constructor(private readonly deps: { readonly uow: PropertiesUnitOfWork }) {}

  async execute(
    input: PropertyIdInput,
    actor: Actor,
  ): Promise<Result<FollowUpListingProfile, GetPropertyFollowUpProfileError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });
    const parsed = PropertyIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));

    const profile = await this.deps.uow.run(async (tx) => {
      const property = await findProperty(tx.properties, parsed.data.propertyId);
      if (!property || property.isDeleted) return undefined;
      const s = property.toSnapshot();
      const listed = isPubliclyListed({
        status: s.status,
        publishedOnWeb: s.publication.publishedOnWeb,
      });
      return {
        ...(await interestProfileOf(tx, property)),
        listed,
        listedSince: s.status === 'available' ? s.statusChangedAt : undefined,
      };
    });
    return profile ? ok(profile) : err({ type: 'PropertyNotFound' });
  }
}
