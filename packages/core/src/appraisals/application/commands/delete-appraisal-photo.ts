import {
  auditAction,
  err,
  ok,
  parseId,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { AppraisalPhotoInputSchema, type AppraisalPhotoInput } from '../../contracts';
import type { AppraisalConvertedError, AppraisalDeletedError } from '../../domain/appraisal';
import {
  appraisalTarget,
  invalidInput,
  loadAppraisalForChange,
  type AppraisalNotFoundError,
  type AppraisalPhotoNotFoundError,
  type InvalidInputError,
} from '../appraisal-support';
import type { AppraisalsUnitOfWork } from '../ports/appraisals-transaction';

export type DeleteAppraisalPhotoError =
  | ForbiddenError
  | InvalidInputError
  | AppraisalNotFoundError
  | AppraisalPhotoNotFoundError
  | AppraisalDeletedError
  | AppraisalConvertedError;

/**
 * Saca una foto de la tasación con `appraisals:update`. La fila se borra en la transacción y el
 * archivo lo borra un job (`AppraisalPhotoDeleted`). Queda en el historial de la tasación.
 */
export class DeleteAppraisalPhoto {
  constructor(
    private readonly deps: { readonly uow: AppraisalsUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: AppraisalPhotoInput,
    actor: Actor,
  ): Promise<Result<void, DeleteAppraisalPhotoError>> {
    if (!actor.can('appraisals:update')) return err({ type: 'Forbidden' });
    const parsed = AppraisalPhotoInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const photoId = parseId<'AppraisalPhoto'>(parsed.data.photoId);
    if (photoId.isErr()) return err({ type: 'AppraisalPhotoNotFound' });
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, DeleteAppraisalPhotoError>> => {
      const loaded = await loadAppraisalForChange(
        tx,
        actor,
        'appraisals:update',
        parsed.data.appraisalId,
      );
      if (loaded.isErr()) return err(loaded.error);
      const appraisal = loaded.value;
      const photo = await tx.photos.findById(photoId.value);
      if (photo?.appraisalId !== appraisal.id) return err({ type: 'AppraisalPhotoNotFound' });

      const removed = appraisal.removePhoto(photo.storageKey, now);
      if (removed.isErr()) return err(removed.error);
      await tx.photos.delete(photo.id);
      await tx.appraisals.save(appraisal, actor.id);
      await tx.events.publish(appraisal.pullEvents());
      await tx.audit.record(
        auditAction(actor, appraisalTarget('appraisal.photo_deleted', appraisal), {
          [`photos.${photo.id}`]: { before: photo.storageKey, after: null },
        }),
      );
      return ok(undefined);
    });
  }
}
