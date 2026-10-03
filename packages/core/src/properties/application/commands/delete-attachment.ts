import {
  auditAction,
  diffChanges,
  err,
  ok,
  type Actor,
  type Clock,
  type Result,
} from '../../../shared';
import { AttachmentIdInputSchema, type AttachmentIdInput } from '../../contracts';
import {
  attachmentAuditState,
  canEditMedia,
  childState,
  loadAttachmentForEdit,
  ownerTarget,
  type AttachmentNotFoundError,
  type MediaOwnerError,
} from '../media-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import { invalidInput, type InvalidInputError } from '../property-support';

export type DeleteAttachmentError = InvalidInputError | MediaOwnerError | AttachmentNotFoundError;

/** Borra un archivo de la ficha (baja lógica: el archivo queda en el storage). */
export class DeleteAttachment {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: AttachmentIdInput,
    actor: Actor,
  ): Promise<Result<void, DeleteAttachmentError>> {
    if (!canEditMedia(actor)) return err({ type: 'Forbidden' });
    const parsed = AttachmentIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, DeleteAttachmentError>> => {
      const loaded = await loadAttachmentForEdit(tx, actor, parsed.data.attachmentId);
      if (loaded.isErr()) return err(loaded.error);
      const attachment = loaded.value;
      const before = childState(`attachments.${attachment.id}`, attachmentAuditState(attachment));
      if (!attachment.delete(now)) return ok(undefined);

      await tx.attachments.save(attachment, actor.id);
      await tx.audit.record(
        auditAction(
          actor,
          ownerTarget('attachment_deleted', attachment.owner),
          diffChanges(before, {}),
        ),
      );
      return ok(undefined);
    });
  }
}
