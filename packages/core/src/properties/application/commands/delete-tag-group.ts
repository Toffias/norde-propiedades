import {
  auditAction,
  diffChanges,
  err,
  ok,
  type Actor,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { TagGroupIdInputSchema, type TagGroupIdInput } from '../../contracts';
import {
  catalogTarget,
  idOf,
  tagGroupAuditState,
  type TagGroupNotEmptyError,
  type TagGroupNotFoundError,
} from '../catalog-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { InvalidInputError } from '../property-support';

export type DeleteTagGroupError =
  ForbiddenError | InvalidInputError | TagGroupNotFoundError | TagGroupNotEmptyError;

/**
 * Borra un grupo vacío. Es configuración, no un dato de negocio: se borra de verdad, y la
 * auditoría guarda cómo era. Un grupo con etiquetas no se borra: primero se mueven o se borran.
 */
export class DeleteTagGroup {
  constructor(private readonly deps: { readonly uow: PropertiesUnitOfWork }) {}

  async execute(input: TagGroupIdInput, actor: Actor): Promise<Result<void, DeleteTagGroupError>> {
    if (!actor.can('tags:update')) return err({ type: 'Forbidden' });

    const parsed = TagGroupIdInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }

    return this.deps.uow.run(async (tx): Promise<Result<void, DeleteTagGroupError>> => {
      const id = idOf<'PropertyTagGroup'>(parsed.data.groupId);
      const group = id === undefined ? undefined : await tx.tagGroups.findById(id);
      if (!group) return err({ type: 'TagGroupNotFound' });
      if ((await tx.tagGroups.countTags(group.id)) > 0) return err({ type: 'TagGroupNotEmpty' });

      await tx.tagGroups.delete(group.id);
      await tx.audit.record(
        auditAction(
          actor,
          catalogTarget('property_tag_group', 'property_tag_group.deleted', group.id),
          diffChanges(tagGroupAuditState(group), {}),
        ),
      );
      return ok(undefined);
    });
  }
}
