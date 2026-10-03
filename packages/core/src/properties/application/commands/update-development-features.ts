import { err, type Actor, type Clock, type Result } from '../../../shared';
import {
  UpdateDevelopmentFeaturesInputSchema,
  type UpdateDevelopmentFeaturesInput,
} from '../../contracts';
import type { DevelopmentInTrashError } from '../../domain/development';
import type { FeatureNotFoundError } from '../catalog-support';
import {
  canEditDevelopments,
  runDevelopmentEdit,
  type EditDevelopmentError,
} from '../development-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput } from '../property-support';

export type UpdateDevelopmentFeaturesError =
  EditDevelopmentError | DevelopmentInTrashError | FeatureNotFoundError;

/** Servicios y amenities del emprendimiento, del catálogo de Mi empresa. Las unidades nuevas los heredan. */
export class UpdateDevelopmentFeatures {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: UpdateDevelopmentFeaturesInput,
    actor: Actor,
  ): Promise<Result<void, UpdateDevelopmentFeaturesError>> {
    if (!canEditDevelopments(actor)) return err({ type: 'Forbidden' });
    const parsed = UpdateDevelopmentFeaturesInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const featureIds = [...new Set(parsed.data.featureIds)];
    const now = this.deps.clock.now();

    return runDevelopmentEdit(this.deps.uow, actor, parsed.data.developmentId, {
      apply: async (development, tx): Promise<Result<boolean, UpdateDevelopmentFeaturesError>> => {
        const existing = await tx.features.findExistingIds(featureIds);
        if (existing.length !== featureIds.length) return err({ type: 'FeatureNotFound' });
        return development.updateFeatures(featureIds, now);
      },
    });
  }
}
