import {
  auditUpdated,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { UpdateTagInputSchema, type UpdateTagInput } from '../../contracts';
import {
  catalogTarget,
  idOf,
  tagAuditState,
  type TagGroupNotFoundError,
  type TagNameTakenError,
  type TagNotFoundError,
} from '../catalog-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { InvalidInputError } from '../property-support';

import { resolveTagGroup } from './create-tag';

export type UpdateTagError =
  ForbiddenError | InvalidInputError | TagNotFoundError | TagGroupNotFoundError | TagNameTakenError;

/** Renombra una etiqueta o la mueve a otro grupo. Las propiedades que la tienen la conservan. */
export class UpdateTag {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(input: UpdateTagInput, actor: Actor): Promise<Result<void, UpdateTagError>> {
    if (!actor.can('tags:update')) return err({ type: 'Forbidden' });

    const parsed = UpdateTagInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { tagId, groupId, name } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdateTagError>> => {
      const id = idOf<'PropertyTag'>(tagId);
      const tag = id === undefined ? undefined : await tx.tags.findById(id);
      if (!tag) return err({ type: 'TagNotFound' });
      const group = await resolveTagGroup(tx, groupId);
      if (group === undefined) return err({ type: 'TagGroupNotFound' });
      const sameName = await tx.tags.findInGroup(group ?? undefined, name);
      if (sameName && sameName.id !== tag.id) return err({ type: 'TagNameTaken' });

      const before = tagAuditState(tag);
      tag.update({ name, groupId: group ?? undefined }, now);
      const entry = auditUpdated(
        actor,
        catalogTarget('property_tag', 'property_tag.updated', tag.id),
        before,
        tagAuditState(tag),
      );
      if (!entry) return ok(undefined);

      await tx.tags.save(tag, actor.id);
      await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}
