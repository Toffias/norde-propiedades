import {
  auditAction,
  diffChanges,
  err,
  ok,
  type Actor,
  type Clock,
  type Result,
} from '../../../shared';
import { MediaIdInputSchema, type MediaIdInput } from '../../contracts';
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

export type DeletePropertyMediaError =
  EditPropertyError | PropertyInTrashError | MediaNotFoundError;

/**
 * Borra una foto, un video o un recorrido. Si era la portada, la pasa a la primera foto que quede.
 * Los archivos del storage los borra un job (`MediaDeleted`), después de confirmar el borrado.
 */
export class DeletePropertyMedia {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: MediaIdInput,
    actor: Actor,
  ): Promise<Result<void, DeletePropertyMediaError>> {
    if (!canEditProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = MediaIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, DeletePropertyMediaError>> => {
      const loaded = await loadMediaForEdit(tx, actor, parsed.data.mediaId);
      if (loaded.isErr()) return err(loaded.error);
      const { item, property } = loaded.value;
      if (property.isDeleted) return err({ type: 'PropertyInTrash' });

      const before = childState(`media.${item.id}`, mediaAuditState(item));
      item.delete(now);
      await tx.media.delete(item.id);
      await tx.events.publish(item.pullEvents());

      if (item.isCover) {
        const next = (await tx.media.listForProperty(property.id)).find(
          (other) => other.kind === 'photo',
        );
        if (next) {
          next.markCover(true, now);
          await tx.media.save(next, actor.id);
        }
      }
      await tx.audit.record(
        auditAction(
          actor,
          propertyTarget('property.media_deleted', property.id),
          diffChanges(before, {}),
        ),
      );
      return ok(undefined);
    });
  }
}
