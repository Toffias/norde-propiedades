import {
  auditAction,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import type { FileStorage } from '../../../settings';
import { UploadAppraisalPhotoInputSchema, type UploadAppraisalPhotoInput } from '../../contracts';
import type { AppraisalConvertedError, AppraisalDeletedError } from '../../domain/appraisal';
import {
  appraisalPhotoKey,
  checkPhotoRoom,
  validateAppraisalPhoto,
  type PhotoTooLargeError,
  type TooManyPhotosError,
  type UnsupportedPhotoTypeError,
} from '../../domain/appraisal-photo';
import {
  appraisalTarget,
  invalidInput,
  loadAppraisalForChange,
  type AppraisalNotFoundError,
  type InvalidInputError,
} from '../appraisal-support';
import type { AppraisalsTransaction, AppraisalsUnitOfWork } from '../ports/appraisals-transaction';

export type UploadAppraisalPhotoError =
  | ForbiddenError
  | InvalidInputError
  | AppraisalNotFoundError
  | AppraisalDeletedError
  | AppraisalConvertedError
  | UnsupportedPhotoTypeError
  | PhotoTooLargeError
  | TooManyPhotosError;

/** La tasación se puede cambiar y le entra una foto más. */
async function checkUpload(tx: AppraisalsTransaction, actor: Actor, appraisalId: string) {
  const loaded = await loadAppraisalForChange(tx, actor, 'appraisals:update', appraisalId);
  if (loaded.isErr()) return err(loaded.error);
  const appraisal = loaded.value;
  const editable = appraisal.checkEditable();
  if (editable.isErr()) return err(editable.error);
  const room = checkPhotoRoom(await tx.photos.count(appraisal.id));
  if (room.isErr()) return err(room.error);
  return ok(appraisal);
}

/**
 * Sube una foto de la visita con `appraisals:update`. La original va al storage privado tal cual; si
 * el registro falla, se borra lo subido. Queda en el historial de la tasación.
 */
export class UploadAppraisalPhoto {
  constructor(
    private readonly deps: {
      readonly uow: AppraisalsUnitOfWork;
      readonly storage: FileStorage;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: UploadAppraisalPhotoInput,
    actor: Actor,
  ): Promise<Result<{ readonly photoId: string }, UploadAppraisalPhotoError>> {
    if (!actor.can('appraisals:update')) return err({ type: 'Forbidden' });
    const parsed = UploadAppraisalPhotoInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { appraisalId, contentType, bytes } = parsed.data;
    const valid = validateAppraisalPhoto({ contentType, sizeBytes: bytes.byteLength });
    if (valid.isErr()) return err(valid.error);

    // Antes de subir nada: que exista, que la pueda cambiar y que tenga lugar.
    const allowed = await this.deps.uow.run((tx) => checkUpload(tx, actor, appraisalId));
    if (allowed.isErr()) return err(allowed.error);

    const id = nextId<'AppraisalPhoto'>(this.deps.ids);
    const storageKey = appraisalPhotoKey(allowed.value.id, id);
    await this.deps.storage.put({ key: storageKey, contentType, bytes });

    let result: Result<{ readonly photoId: string }, UploadAppraisalPhotoError>;
    try {
      result = await this.deps.uow.run(
        async (tx): Promise<Result<{ readonly photoId: string }, UploadAppraisalPhotoError>> => {
          const checked = await checkUpload(tx, actor, appraisalId);
          if (checked.isErr()) return err(checked.error);
          const appraisal = checked.value;
          await tx.photos.insert(
            {
              id,
              appraisalId: appraisal.id,
              storageKey,
              position: await tx.photos.nextPosition(appraisal.id),
              createdAt: this.deps.clock.now(),
            },
            actor.id,
          );
          await tx.audit.record(
            auditAction(actor, appraisalTarget('appraisal.photo_added', appraisal), {
              [`photos.${id}`]: { before: null, after: storageKey },
            }),
          );
          return ok({ photoId: id });
        },
      );
    } catch (error) {
      await this.deps.storage.delete(storageKey);
      throw error;
    }
    if (result.isErr()) await this.deps.storage.delete(storageKey);
    return result;
  }
}
