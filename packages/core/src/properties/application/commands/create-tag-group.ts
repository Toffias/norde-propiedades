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
import { CreateTagGroupInputSchema, type CreateTagGroupInput } from '../../contracts';
import { TagGroup } from '../../domain/property-tag';
import { catalogTarget, tagGroupAuditState, type TagGroupNameTakenError } from '../catalog-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { InvalidInputError } from '../property-support';

export type CreateTagGroupError = ForbiddenError | InvalidInputError | TagGroupNameTakenError;

/** Crea un grupo de etiquetas de propiedades, al final de la lista. */
export class CreateTagGroup {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: CreateTagGroupInput,
    actor: Actor,
  ): Promise<Result<{ readonly groupId: string }, CreateTagGroupError>> {
    if (!actor.can('tags:update')) return err({ type: 'Forbidden' });

    const parsed = CreateTagGroupInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { name } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly groupId: string }, CreateTagGroupError>> => {
        if (await tx.tagGroups.findByName(name)) return err({ type: 'TagGroupNameTaken' });
        const group = TagGroup.create({
          id: nextId<'PropertyTagGroup'>(this.deps.ids),
          name,
          position: await tx.tagGroups.nextPosition(),
          now,
        });
        await tx.tagGroups.save(group, actor.id);
        await tx.audit.record(
          auditCreated(
            actor,
            catalogTarget('property_tag_group', 'property_tag_group.created', group.id),
            tagGroupAuditState(group),
          ),
        );
        return ok({ groupId: group.id });
      },
    );
  }
}
