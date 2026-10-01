import {
  auditUpdated,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { RenameTagGroupInputSchema, type RenameTagGroupInput } from '../../contracts';
import {
  catalogTarget,
  idOf,
  tagGroupAuditState,
  type TagGroupNameTakenError,
  type TagGroupNotFoundError,
} from '../catalog-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { InvalidInputError } from '../property-support';

export type RenameTagGroupError =
  ForbiddenError | InvalidInputError | TagGroupNotFoundError | TagGroupNameTakenError;

export class RenameTagGroup {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: RenameTagGroupInput,
    actor: Actor,
  ): Promise<Result<void, RenameTagGroupError>> {
    if (!actor.can('tags:update')) return err({ type: 'Forbidden' });

    const parsed = RenameTagGroupInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { groupId, name } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, RenameTagGroupError>> => {
      const id = idOf<'PropertyTagGroup'>(groupId);
      const group = id === undefined ? undefined : await tx.tagGroups.findById(id);
      if (!group) return err({ type: 'TagGroupNotFound' });
      const sameName = await tx.tagGroups.findByName(name);
      if (sameName && sameName.id !== group.id) return err({ type: 'TagGroupNameTaken' });

      const before = tagGroupAuditState(group);
      group.rename(name, now);
      const entry = auditUpdated(
        actor,
        catalogTarget('property_tag_group', 'property_tag_group.updated', group.id),
        before,
        tagGroupAuditState(group),
      );
      if (!entry) return ok(undefined);

      await tx.tagGroups.save(group, actor.id);
      await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}
