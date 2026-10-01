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
import {
  UploadPropertyAttachmentInputSchema,
  type UploadPropertyAttachmentInput,
} from '../../contracts';
import type { PropertyInTrashError } from '../../domain/property';
import {
  PropertyAttachment,
  type AttachmentTooLargeError,
  type InvalidAttachmentNameError,
  type UnsupportedAttachmentTypeError,
} from '../../domain/property-attachment';
import { attachmentAuditState, attachmentKey, childState } from '../media-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  canEditProperties,
  invalidInput,
  loadForEdit,
  propertyTarget,
  type EditPropertyError,
} from '../property-support';

export type UploadPropertyAttachmentError =
  | EditPropertyError
  | PropertyInTrashError
  | UnsupportedAttachmentTypeError
  | AttachmentTooLargeError
  | InvalidAttachmentNameError;

/**
 * Adjunta un archivo a la propiedad (escritura, reglamento): primero al storage, con una clave
 * generada, y después lo registra. Si el registro falla, borra lo subido.
 */
export class UploadPropertyAttachment {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly storage: FileStorage;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: UploadPropertyAttachmentInput,
    actor: Actor,
  ): Promise<Result<{ readonly attachmentId: string }, UploadPropertyAttachmentError>> {
    if (!canEditProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = UploadPropertyAttachmentInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { propertyId, fileName, contentType, bytes } = parsed.data;
    const valid = PropertyAttachment.validateUpload({
      fileName,
      contentType,
      sizeBytes: bytes.byteLength,
    });
    if (valid.isErr()) return err(valid.error);

    const allowed = await this.deps.uow.run(
      async (tx): Promise<Result<void, UploadPropertyAttachmentError>> => {
        const property = await loadForEdit(tx, actor, propertyId);
        if (property.isErr()) return err(property.error);
        return property.value.isDeleted ? err({ type: 'PropertyInTrash' }) : ok(undefined);
      },
    );
    if (allowed.isErr()) return err(allowed.error);

    const id = nextId<'PropertyAttachment'>(this.deps.ids);
    const storageKey = attachmentKey(propertyId, id);
    await this.deps.storage.put({ key: storageKey, contentType, bytes });

    type Output = Result<{ readonly attachmentId: string }, UploadPropertyAttachmentError>;
    let result: Output;
    try {
      result = await this.deps.uow.run(async (tx): Promise<Output> => {
        const property = await loadForEdit(tx, actor, propertyId);
        if (property.isErr()) return err(property.error);
        const uploaded = PropertyAttachment.upload({
          id,
          propertyId: property.value.id,
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
            propertyTarget('property.attachment_added', property.value.id),
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
