import {
  auditAction,
  diffChanges,
  err,
  ok,
  type Actor,
  type AuditState,
  type Clock,
  type Result,
} from '../../../shared';
import { MediaIdInputSchema, type MediaIdInput } from '../../contracts';
import {
  canEditMedia,
  childState,
  loadMediaForEdit,
  mediaAuditState,
  ownerTarget,
  type EditMediaError,
  type MediaNotFoundError,
} from '../media-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput } from '../property-support';

export type DeleteMediaError = EditMediaError | MediaNotFoundError;

/**
 * Borra una foto, un video o un recorrido. Si era la portada, la pasa a la primera foto que quede.
 * Los archivos del storage los borra un job (`MediaDeleted`), después de confirmar el borrado.
 */
export class DeleteMedia {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(input: MediaIdInput, actor: Actor): Promise<Result<void, DeleteMediaError>> {
    if (!canEditMedia(actor)) return err({ type: 'Forbidden' });
    const parsed = MediaIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, DeleteMediaError>> => {
      const loaded = await loadMediaForEdit(tx, actor, parsed.data.mediaId);
      if (loaded.isErr()) return err(loaded.error);
      const item = loaded.value;

      let before = childState(`media.${item.id}`, mediaAuditState(item));
      let after: AuditState = {};
      item.delete(now);
      await tx.media.delete(item.id);
      await tx.events.publish(item.pullEvents());

      if (item.isCover) {
        const next = (await tx.media.listForOwner(item.owner)).find(
          (other) => other.kind === 'photo',
        );
        if (next) {
          // La nueva portada también va al historial y avisa su cambio, como en SetMediaCover.
          before = { ...before, [`media.${next.id}.isCover`]: next.isCover };
          next.markCover(true, now);
          after = { [`media.${next.id}.isCover`]: next.isCover };
          await tx.media.save(next, actor.id);
          await tx.events.publish(next.pullEvents());
        }
      }
      await tx.audit.record(
        auditAction(actor, ownerTarget('media_deleted', item.owner), diffChanges(before, after)),
      );
      return ok(undefined);
    });
  }
}
