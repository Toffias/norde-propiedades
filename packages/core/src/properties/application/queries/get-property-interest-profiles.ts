import type { PropertyInterestProfile } from '../../../clients';
import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import { PropertyIdsInputSchema, type PropertyIdsInput } from '../../contracts';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { findProperty, invalidInput, type InvalidInputError } from '../property-support';

import { interestProfileOf } from './get-property-interest-profile';

export type GetPropertyInterestProfilesError = ForbiddenError | InvalidInputError;

/**
 * Los perfiles de cruce de varias propiedades a la vez (para destacar varias juntas). Las que no
 * existen no vienen.
 */
export class GetPropertyInterestProfiles {
  constructor(private readonly deps: { readonly uow: PropertiesUnitOfWork }) {}

  async execute(
    input: PropertyIdsInput,
    actor: Actor,
  ): Promise<Result<PropertyInterestProfile[], GetPropertyInterestProfilesError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });
    const parsed = PropertyIdsInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));

    const profiles = await this.deps.uow.run(async (tx) => {
      const found: PropertyInterestProfile[] = [];
      for (const id of new Set(parsed.data.propertyIds.map((raw) => raw.toLowerCase()))) {
        const property = await findProperty(tx.properties, id);
        if (property) found.push(await interestProfileOf(tx, property));
      }
      return found;
    });
    return ok(profiles);
  }
}
