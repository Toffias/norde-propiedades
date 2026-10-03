import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import type { FileStorage } from '../../../settings';
import {
  AttachmentIdInputSchema,
  type AttachmentIdInput,
  type StoredFileDelivery,
} from '../../contracts';
import { idOf } from '../catalog-support';
import { canReadAnyMedia, canReadMedia, type AttachmentNotFoundError } from '../media-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput, type InvalidInputError } from '../property-support';

export type GetAttachmentDownloadError =
  ForbiddenError | InvalidInputError | AttachmentNotFoundError;

/** Una URL firmada dura lo justo para empezar la descarga. */
const SIGNED_URL_SECONDS = 60;

/**
 * Descarga un archivo de la ficha: con S3/R2, una URL firmada de un minuto; con el disco local, el
 * contenido. Los borrados no se descargan.
 */
export class GetAttachmentDownload {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly storage: FileStorage },
  ) {}

  async execute(
    input: AttachmentIdInput,
    actor: Actor,
  ): Promise<Result<StoredFileDelivery, GetAttachmentDownloadError>> {
    if (!canReadAnyMedia(actor)) return err({ type: 'Forbidden' });
    const parsed = AttachmentIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const id = idOf<'Attachment'>(parsed.data.attachmentId);
    const attachment =
      id === undefined ? undefined : await this.deps.uow.run((tx) => tx.attachments.findById(id));
    if (!attachment || attachment.isDeleted) return err({ type: 'AttachmentNotFound' });
    if (!canReadMedia(actor, attachment.owner.kind)) return err({ type: 'Forbidden' });

    const url = await this.deps.storage.signedUrl(attachment.storageKey, {
      expiresInSeconds: SIGNED_URL_SECONDS,
      downloadName: attachment.name,
    });
    if (url !== undefined) return ok({ kind: 'redirect', url });
    const stored = await this.deps.storage.get(attachment.storageKey);
    if (!stored) return err({ type: 'AttachmentNotFound' });
    return ok({
      kind: 'content',
      fileName: attachment.name,
      contentType: attachment.mimeType,
      bytes: stored.bytes,
    });
  }
}
