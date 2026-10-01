import {
  auditAction,
  diffChanges,
  err,
  ok,
  type Actor,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { TagIdInputSchema, type TagIdInput } from '../../contracts';
import {
  catalogTarget,
  idOf,
  tagAuditState,
  type TagInUseError,
  type TagNotFoundError,
} from '../catalog-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { InvalidInputError } from '../property-support';

export type DeleteTagError = ForbiddenError | InvalidInputError | TagNotFoundError | TagInUseError;

/**
 * Borra una etiqueta que nadie usa. Es configuración: se borra de verdad y la auditoría guarda
 * cómo era. Si alguna propiedad o emprendimiento la tiene, primero se la quitan (edición rápida).
 */
export class DeleteTag {
  constructor(private readonly deps: { readonly uow: PropertiesUnitOfWork }) {}

  async execute(input: TagIdInput, actor: Actor): Promise<Result<void, DeleteTagError>> {
    if (!actor.can('tags:update')) return err({ type: 'Forbidden' });

    const parsed = TagIdInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }

    return this.deps.uow.run(async (tx): Promise<Result<void, DeleteTagError>> => {
      const id = idOf<'PropertyTag'>(parsed.data.tagId);
      const tag = id === undefined ? undefined : await tx.tags.findById(id);
      if (!tag) return err({ type: 'TagNotFound' });
      const uses = await tx.tags.countUses(tag.id);
      if (uses > 0) return err({ type: 'TagInUse', uses });

      await tx.tags.delete(tag.id);
      await tx.audit.record(
        auditAction(
          actor,
          catalogTarget('property_tag', 'property_tag.deleted', tag.id),
          diffChanges(tagAuditState(tag), {}),
        ),
      );
      return ok(undefined);
    });
  }
}
