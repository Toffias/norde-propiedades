import {
  auditAction,
  diffChanges,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type IdGenerator,
  type Result,
} from '../../../shared';
import type { FileStorage } from '../../../settings';
import { UploadAttachmentInputSchema, type UploadAttachmentInput } from '../../contracts';
import {
  Attachment,
  type AttachmentTooLargeError,
  type InvalidAttachmentNameError,
  type UnsupportedAttachmentTypeError,
} from '../../domain/attachment';
import {
  attachmentAuditState,
  attachmentKey,
  canEditMedia,
  childState,
  loadActiveOwner,
  ownerTarget,
  toMediaOwner,
  type EditMediaError,
} from '../media-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput } from '../property-support';

export type UploadAttachmentError =
  | EditMediaError
  | UnsupportedAttachmentTypeError
  | AttachmentTooLargeError
  | InvalidAttachmentNameError;

/**
 * Adjunta un archivo a una propiedad o un emprendimiento (escritura, reglamento): primero al
 * storage, con una clave generada, y después lo registra. Si el registro falla, borra lo subido.
 */
export class UploadAttachment {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly storage: FileStorage;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: UploadAttachmentInput,
    actor: Actor,
  ): Promise<Result<{ readonly attachmentId: string }, UploadAttachmentError>> {
    if (!canEditMedia(actor)) return err({ type: 'Forbidden' });
    const parsed = UploadAttachmentInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { fileName, contentType, bytes } = parsed.data;
    const valid = Attachment.validateUpload({ fileName, contentType, sizeBytes: bytes.byteLength });
    if (valid.isErr()) return err(valid.error);
    const owner = toMediaOwner(parsed.data.owner);
    if (owner.isErr()) return err(owner.error);

    const allowed = await this.deps.uow.run(
      async (tx): Promise<Result<void, UploadAttachmentError>> => {
        const active = await loadActiveOwner(tx, actor, parsed.data.owner);
        return active.isErr() ? err(active.error) : ok(undefined);
      },
    );
    if (allowed.isErr()) return err(allowed.error);

    const id = nextId<'Attachment'>(this.deps.ids);
    const storageKey = attachmentKey(owner.value, id);
    await this.deps.storage.put({ key: storageKey, contentType, bytes });

    type Output = Result<{ readonly attachmentId: string }, UploadAttachmentError>;
    let result: Output;
    try {
      result = await this.deps.uow.run(async (tx): Promise<Output> => {
        const active = await loadActiveOwner(tx, actor, parsed.data.owner);
        if (active.isErr()) return err(active.error);
        const uploaded = Attachment.upload({
          id,
          owner: active.value,
          fileName,
          storageKey,
          contentType,
          sizeBytes: bytes.byteLength,
          uploadedBy: actor.id,
          now: this.deps.clock.now(),
        });
        if (uploaded.isErr()) return err(uploaded.error);
        const attachment = uploaded.value;

        await tx.attachments.save(attachment, actor.id);
        await tx.audit.record(
          auditAction(
            actor,
            ownerTarget('attachment_added', active.value),
            diffChanges(
              {},
              childState(`attachments.${attachment.id}`, attachmentAuditState(attachment)),
            ),
          ),
        );
        return ok({ attachmentId: attachment.id });
      });
    } catch (error) {
      await this.deps.storage.delete(storageKey);
      throw error;
    }
    if (result.isErr()) await this.deps.storage.delete(storageKey);
    return result;
  }
}
