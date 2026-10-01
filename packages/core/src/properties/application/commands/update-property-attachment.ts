import {
  auditAction,
  diffChanges,
  err,
  ok,
  type Actor,
  type Clock,
  type Result,
} from '../../../shared';
import {
  UpdatePropertyAttachmentInputSchema,
  type UpdatePropertyAttachmentInput,
} from '../../contracts';
import type { InvalidAttachmentNameError } from '../../domain/property-attachment';
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

export type UpdatePropertyAttachmentError =
  EditPropertyError | AttachmentNotFoundError | InvalidAttachmentNameError;

/** Renombra un archivo o cambia "Mostrar en la web". */
export class UpdatePropertyAttachment {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: UpdatePropertyAttachmentInput,
    actor: Actor,
  ): Promise<Result<void, UpdatePropertyAttachmentError>> {
    if (!canEditProperties(actor)) return err({ type: 'Forbidden' });
    const parsed = UpdatePropertyAttachmentInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { attachmentId, name, showOnWeb } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdatePropertyAttachmentError>> => {
      const loaded = await loadAttachmentForEdit(tx, actor, attachmentId);
      if (loaded.isErr()) return err(loaded.error);
      const attachment = loaded.value;
      const before = attachmentAuditState(attachment);
      const updated = attachment.update(
        {
          ...(name === undefined ? {} : { name }),
          ...(showOnWeb === undefined ? {} : { showOnWeb }),
        },
        now,
      );
      if (updated.isErr()) return err(updated.error);
      if (!updated.value) return ok(undefined);

      await tx.attachments.save(attachment, actor.id);
      const prefix = `attachments.${attachment.id}`;
      await tx.audit.record(
        auditAction(
          actor,
          propertyTarget('property.attachment_updated', attachment.propertyId),
          diffChanges(
            childState(prefix, before),
            childState(prefix, attachmentAuditState(attachment)),
          ),
        ),
      );
      return ok(undefined);
    });
  }
}
