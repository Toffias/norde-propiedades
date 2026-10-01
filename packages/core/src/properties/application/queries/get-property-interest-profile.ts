import type { PropertyInterestProfile } from '../../../clients';
import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import { PropertyIdInputSchema, type PropertyIdInput } from '../../contracts';
import { idOf } from '../catalog-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  findProperty,
  invalidInput,
  type InvalidInputError,
  type PropertyNotFoundError,
} from '../property-support';

export type GetPropertyInterestProfileError =
  ForbiddenError | InvalidInputError | PropertyNotFoundError;

/**
 * Lo que de la propiedad se cruza con las búsquedas guardadas de los clientes: tipo, operaciones
 * con precio, ubicación con sus ancestros y ambientes. Lo usan los interesados y las estadísticas.
 */
export class GetPropertyInterestProfile {
  constructor(private readonly deps: { readonly uow: PropertiesUnitOfWork }) {}

  async execute(
    input: PropertyIdInput,
    actor: Actor,
  ): Promise<Result<PropertyInterestProfile, GetPropertyInterestProfileError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });
    const parsed = PropertyIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));

    const profile = await this.deps.uow.run(async (tx) => {
      const property = await findProperty(tx.properties, parsed.data.propertyId);
      if (!property) return undefined;
      const s = property.toSnapshot();
      const locationId = s.locationId === undefined ? undefined : idOf<'Location'>(s.locationId);
      const lineage = locationId === undefined ? [] : await tx.locations.findLineage(locationId);
      return {
        propertyId: s.id,
        propertyType: s.kind,
        operations: s.operations.map((o) => ({
          operation: o.operation,
          currency: o.currency,
          priceCents: o.priceOnRequest ? undefined : o.priceCents,
        })),
        locationIds: lineage.map((location) => location.id),
        rooms: s.characteristics.rooms,
      };
    });
    return profile ? ok(profile) : err({ type: 'PropertyNotFound' });
  }
}
