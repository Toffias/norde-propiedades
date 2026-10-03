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
import type { NotAnImageError } from '../../domain/media-item';
import {
  canEditMedia,
  loadMediaForEdit,
  ownerTarget,
  type EditMediaError,
  type MediaNotFoundError,
} from '../media-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput } from '../property-support';

export type SetMediaCoverError = EditMediaError | MediaNotFoundError | NotAnImageError;

/** Elige la foto de portada: la anterior deja de serlo. */
export class SetMediaCover {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(input: MediaIdInput, actor: Actor): Promise<Result<void, SetMediaCoverError>> {
    if (!canEditMedia(actor)) return err({ type: 'Forbidden' });
    const parsed = MediaIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, SetMediaCoverError>> => {
      const loaded = await loadMediaForEdit(tx, actor, parsed.data.mediaId);
      if (loaded.isErr()) return err(loaded.error);
      const item = loaded.value;
      if (item.isCover) return ok(undefined);
      const marked = item.markCover(true, now);
      if (marked.isErr()) return err(marked.error);

      // Primero se desmarca la anterior: la base admite una sola portada por galería.
      const previous = (await tx.media.listForOwner(item.owner)).find(
        (other) => other.isCover && other.id !== item.id,
      );
      if (previous) {
        previous.markCover(false, now);
        await tx.media.save(previous, actor.id);
      }
      await tx.media.save(item, actor.id);
      await tx.audit.record(
        auditAction(
          actor,
          ownerTarget('cover_changed', item.owner),
          diffChanges({ coverMediaId: previous?.id }, { coverMediaId: item.id }),
        ),
      );
      return ok(undefined);
    });
  }
}
