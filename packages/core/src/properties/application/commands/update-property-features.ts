import { err, type Actor, type Clock, type Result } from '../../../shared';
import {
  UpdatePropertyFeaturesInputSchema,
  type UpdatePropertyFeaturesInput,
} from '../../contracts';
import type { PropertyInTrashError } from '../../domain/property';
import type { FeatureNotFoundError } from '../catalog-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  canEditProperties,
  invalidInput,
  runPropertyEdit,
  type EditPropertyError,
} from '../property-support';

export type UpdatePropertyFeaturesError =
  EditPropertyError | PropertyInTrashError | FeatureNotFoundError;

/** Servicios, ambientes y adicionales marcados en la ficha, del catálogo de Mi empresa. */
export class UpdatePropertyFeatures {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: UpdatePropertyFeaturesInput,
    actor: Actor,
  ): Promise<Result<void, UpdatePropertyFeaturesError>> {
    if (!canEditProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = UpdatePropertyFeaturesInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { propertyId } = parsed.data;
    const featureIds = [...new Set(parsed.data.featureIds)];
    const now = this.deps.clock.now();

    return runPropertyEdit(this.deps.uow, actor, propertyId, {
      apply: async (property, tx): Promise<Result<boolean, UpdatePropertyFeaturesError>> => {
        const existing = await tx.features.findExistingIds(featureIds);
        if (existing.length !== featureIds.length) return err({ type: 'FeatureNotFound' });
        return property.updateFeatures(featureIds, now);
      },
    });
  }
}
