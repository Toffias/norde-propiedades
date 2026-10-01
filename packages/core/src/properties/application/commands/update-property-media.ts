import {
  auditAction,
  diffChanges,
  err,
  ok,
  type Actor,
  type Clock,
  type Result,
} from '../../../shared';
import { UpdatePropertyMediaInputSchema, type UpdatePropertyMediaInput } from '../../contracts';
import type { NotAnImageError } from '../../domain/media-item';
import type { PropertyInTrashError } from '../../domain/property';
import {
  childState,
  loadMediaForEdit,
  mediaAuditState,
  type MediaNotFoundError,
} from '../media-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  canEditProperties,
  invalidInput,
  propertyTarget,
  type EditPropertyError,
} from '../property-support';

export type UpdatePropertyMediaError =
  EditPropertyError | PropertyInTrashError | MediaNotFoundError | NotAnImageError;

/**
 * Por foto: mostrar en la web, incluir en el PDF, es plano, descripción y rotación. Rotar vuelve a
 * generar las variantes (la original no se toca).
 */
export class UpdatePropertyMedia {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: UpdatePropertyMediaInput,
    actor: Actor,
  ): Promise<Result<void, UpdatePropertyMediaError>> {
    if (!canEditProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = UpdatePropertyMediaInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { mediaId, ...change } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdatePropertyMediaError>> => {
      const loaded = await loadMediaForEdit(tx, actor, mediaId);
      if (loaded.isErr()) return err(loaded.error);
      const { item, property } = loaded.value;
      if (property.isDeleted) return err({ type: 'PropertyInTrash' });

      const before = mediaAuditState(item);
      const updated = item.update(
        Object.fromEntries(Object.entries(change).filter(([, value]) => value !== undefined)),
        now,
      );
      if (updated.isErr()) return err(updated.error);
      if (!updated.value) return ok(undefined);

      await tx.media.save(item, actor.id);
      await tx.events.publish(item.pullEvents());
      const prefix = `media.${item.id}`;
      await tx.audit.record(
        auditAction(
          actor,
          propertyTarget('property.media_updated', property.id),
          diffChanges(childState(prefix, before), childState(prefix, mediaAuditState(item))),
        ),
      );
      return ok(undefined);
    });
  }
}
