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
import { CreateTagInputSchema, type CreateTagInput } from '../../contracts';
import { PropertyTag, type TagGroupId } from '../../domain/property-tag';
import {
  catalogTarget,
  idOf,
  tagAuditState,
  type TagGroupNotFoundError,
  type TagNameTakenError,
} from '../catalog-support';
import type { PropertiesTransaction, PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { InvalidInputError } from '../property-support';

export type CreateTagError =
  ForbiddenError | InvalidInputError | TagGroupNotFoundError | TagNameTakenError;

/** El grupo elegido, si existe. Sin grupo: `null`. */
export async function resolveTagGroup(
  tx: PropertiesTransaction,
  rawId: string | undefined,
): Promise<TagGroupId | null | undefined> {
  if (rawId === undefined) return null;
  const id = idOf<'PropertyTagGroup'>(rawId);
  const group = id === undefined ? undefined : await tx.tagGroups.findById(id);
  return group?.id;
}

/** Crea una etiqueta de propiedades, suelta o dentro de un grupo. */
export class CreateTag {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: CreateTagInput,
    actor: Actor,
  ): Promise<Result<{ readonly tagId: string }, CreateTagError>> {
    if (!actor.can('tags:update')) return err({ type: 'Forbidden' });

    const parsed = CreateTagInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { groupId, name } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly tagId: string }, CreateTagError>> => {
        const group = await resolveTagGroup(tx, groupId);
        if (group === undefined) return err({ type: 'TagGroupNotFound' });
        if (await tx.tags.findInGroup(group ?? undefined, name)) {
          return err({ type: 'TagNameTaken' });
        }

        const tag = PropertyTag.create({
          id: nextId<'PropertyTag'>(this.deps.ids),
          groupId: group ?? undefined,
          name,
          now,
        });
        await tx.tags.save(tag, actor.id);
        await tx.audit.record(
          auditCreated(
            actor,
            catalogTarget('property_tag', 'property_tag.created', tag.id),
            tagAuditState(tag),
          ),
        );
        return ok({ tagId: tag.id });
      },
    );
  }
}
