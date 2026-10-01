import {
  auditUpdated,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { UpdateFeatureInputSchema, type UpdateFeatureInput } from '../../contracts';
import {
  catalogTarget,
  featureAuditState,
  idOf,
  type FeatureNameTakenError,
  type FeatureNotFoundError,
} from '../catalog-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { InvalidInputError } from '../property-support';

export type UpdateFeatureError =
  ForbiddenError | InvalidInputError | FeatureNotFoundError | FeatureNameTakenError;

/**
 * Renombra o desactiva un ítem del catálogo. No se borra: las propiedades que lo tienen lo
 * conservan; desactivado, deja de ofrecerse.
 */
export class UpdateFeature {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: UpdateFeatureInput,
    actor: Actor,
  ): Promise<Result<void, UpdateFeatureError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });

    const parsed = UpdateFeatureInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { featureId, name, isActive } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdateFeatureError>> => {
      const id = idOf<'Feature'>(featureId);
      const feature = id === undefined ? undefined : await tx.features.findById(id);
      if (!feature) return err({ type: 'FeatureNotFound' });
      const sameName = await tx.features.findByName(feature.kind, name);
      if (sameName && sameName.id !== feature.id) return err({ type: 'FeatureNameTaken' });

      const before = featureAuditState(feature);
      feature.update({ name, isActive }, now);
      const entry = auditUpdated(
        actor,
        catalogTarget('feature', 'feature.updated', feature.id),
        before,
        featureAuditState(feature),
      );
      if (!entry) return ok(undefined);

      await tx.features.save(feature, actor.id);
      await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}
