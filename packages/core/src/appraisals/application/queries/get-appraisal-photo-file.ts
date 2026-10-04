import { err, ok, parseId, type Actor, type ForbiddenError, type Result } from '../../../shared';
import type { FileStorage } from '../../../settings';
import type { StoredFileDelivery } from '../../../properties';
import { AppraisalPhotoInputSchema, type AppraisalPhotoInput } from '../../contracts';
import {
  invalidInput,
  loadAppraisalForRead,
  type AppraisalNotFoundError,
  type AppraisalPhotoNotFoundError,
  type InvalidInputError,
} from '../appraisal-support';
import type { AppraisalsUnitOfWork } from '../ports/appraisals-transaction';

export type GetAppraisalPhotoFileError =
  ForbiddenError | InvalidInputError | AppraisalNotFoundError | AppraisalPhotoNotFoundError;

/** Lo que dura una URL firmada de una foto: lo que tarda en cargar la ficha. */
const SIGNED_URL_SECONDS = 5 * 60;

/** Una foto de la tasación para mostrarla en su ficha, a quien puede ver la tasación. */
export class GetAppraisalPhotoFile {
  constructor(
    private readonly deps: { readonly uow: AppraisalsUnitOfWork; readonly storage: FileStorage },
  ) {}

  async execute(
    input: AppraisalPhotoInput,
    actor: Actor,
  ): Promise<Result<StoredFileDelivery, GetAppraisalPhotoFileError>> {
    if (!actor.can('appraisals:read')) return err({ type: 'Forbidden' });
    const parsed = AppraisalPhotoInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const photoId = parseId<'AppraisalPhoto'>(parsed.data.photoId);
    if (photoId.isErr()) return err({ type: 'AppraisalPhotoNotFound' });

    const found = await this.deps.uow.run(async (tx) => {
      const loaded = await loadAppraisalForRead(tx, actor, parsed.data.appraisalId);
      if (loaded.isErr()) return err(loaded.error);
      const photo = await tx.photos.findById(photoId.value);
      return photo?.appraisalId === loaded.value.id
        ? ok(photo)
        : err<AppraisalPhotoNotFoundError>({ type: 'AppraisalPhotoNotFound' });
    });
    if (found.isErr()) return err(found.error);

    const key = found.value.storageKey;
    const url = await this.deps.storage.signedUrl(key, { expiresInSeconds: SIGNED_URL_SECONDS });
    if (url !== undefined) return ok({ kind: 'redirect', url });
    const stored = await this.deps.storage.get(key);
    if (!stored) return err({ type: 'AppraisalPhotoNotFound' });
    return ok({
      kind: 'content',
      fileName: `${found.value.id}.${stored.contentType.split('/').at(-1) ?? 'jpg'}`,
      contentType: stored.contentType,
      bytes: stored.bytes,
    });
  }
}
