import {
  auditCreated,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { CreateFeatureInputSchema, type CreateFeatureInput } from '../../contracts';
import { Feature, featureKey } from '../../domain/feature';
import { catalogTarget, featureAuditState, type FeatureNameTakenError } from '../catalog-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { InvalidInputError } from '../property-support';

export type CreateFeatureError = ForbiddenError | InvalidInputError | FeatureNameTakenError;

/** Suma un servicio, un ambiente o un adicional al catálogo, al final de su tipo. */
export class CreateFeature {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: CreateFeatureInput,
    actor: Actor,
  ): Promise<Result<{ readonly featureId: string }, CreateFeatureError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });

    const parsed = CreateFeatureInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { kind, name } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly featureId: string }, CreateFeatureError>> => {
        if (await tx.features.findByName(kind, name)) return err({ type: 'FeatureNameTaken' });

        const position = await tx.features.nextPosition(kind);
        // La clave de un ítem renombrado queda tomada: el nuevo lleva un sufijo.
        const base = featureKey(kind, name);
        const key = (await tx.features.findByKey(base)) ? `${base}-${position}` : base;
        const feature = Feature.create({
          id: nextId<'Feature'>(this.deps.ids),
          kind,
          name,
          key,
          position,
          now,
        });

        await tx.features.save(feature, actor.id);
        await tx.audit.record(
          auditCreated(
            actor,
            catalogTarget('feature', 'feature.created', feature.id),
            featureAuditState(feature),
          ),
        );
        return ok({ featureId: feature.id });
      },
    );
  }
}
