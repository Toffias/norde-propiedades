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
  childState,
  loadAttachmentForEdit,
  type AttachmentNotFoundError,
} from '../media-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import {
  canEditProperties,
  invalidInput,
  propertyTarget,
  type EditPropertyError,
} from '../property-support';

export type DeletePropertyAttachmentError = EditPropertyError | AttachmentNotFoundError;

/** Borra un archivo de la ficha (baja lógica: el archivo queda en el storage). */
export class DeletePropertyAttachment {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: AttachmentIdInput,
    actor: Actor,
  ): Promise<Result<void, DeletePropertyAttachmentError>> {
    if (!canEditProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = AttachmentIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, DeletePropertyAttachmentError>> => {
      const loaded = await loadAttachmentForEdit(tx, actor, parsed.data.attachmentId);
      if (loaded.isErr()) return err(loaded.error);
      const attachment = loaded.value;
      const before = childState(`attachments.${attachment.id}`, attachmentAuditState(attachment));
      if (!attachment.delete(now)) return ok(undefined);

      await tx.attachments.save(attachment, actor.id);
      await tx.audit.record(
        auditAction(
          actor,
          propertyTarget('property.attachment_deleted', attachment.propertyId),
          diffChanges(before, {}),
        ),
      );
      return ok(undefined);
    });
  }
}
