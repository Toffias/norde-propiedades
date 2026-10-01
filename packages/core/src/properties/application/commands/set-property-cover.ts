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
import type { PropertyInTrashError } from '../../domain/property';
import { loadMediaForEdit, type MediaNotFoundError } from '../media-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  canEditProperties,
  invalidInput,
  propertyTarget,
  type EditPropertyError,
} from '../property-support';

export type SetPropertyCoverError =
  EditPropertyError | PropertyInTrashError | MediaNotFoundError | NotAnImageError;

/** Elige la foto de portada: la anterior deja de serlo. */
export class SetPropertyCover {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(input: MediaIdInput, actor: Actor): Promise<Result<void, SetPropertyCoverError>> {
    if (!canEditProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = MediaIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, SetPropertyCoverError>> => {
      const loaded = await loadMediaForEdit(tx, actor, parsed.data.mediaId);
      if (loaded.isErr()) return err(loaded.error);
      const { item, property } = loaded.value;
      if (property.isDeleted) return err({ type: 'PropertyInTrash' });
      if (item.isCover) return ok(undefined);
      const marked = item.markCover(true, now);
      if (marked.isErr()) return err(marked.error);

      // Primero se desmarca la anterior: la base admite una sola portada por propiedad.
      const previous = (await tx.media.listForProperty(property.id)).find(
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
          propertyTarget('property.cover_changed', property.id),
          diffChanges({ coverMediaId: previous?.id }, { coverMediaId: item.id }),
        ),
      );
      return ok(undefined);
    });
  }
}
