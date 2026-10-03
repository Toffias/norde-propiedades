import {
  auditAction,
  diffChanges,
  err,
  ok,
  type Actor,
  type Clock,
  type Result,
} from '../../../shared';
import { UpdateAttachmentInputSchema, type UpdateAttachmentInput } from '../../contracts';
import type { InvalidAttachmentNameError } from '../../domain/attachment';
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

export type UpdateAttachmentError =
  InvalidInputError | MediaOwnerError | AttachmentNotFoundError | InvalidAttachmentNameError;

/** Renombra un archivo o cambia "Mostrar en la web". */
export class UpdateAttachment {
  constructor(
    private readonly deps: { readonly uow: PropertiesUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: UpdateAttachmentInput,
    actor: Actor,
  ): Promise<Result<void, UpdateAttachmentError>> {
    if (!canEditMedia(actor)) return err({ type: 'Forbidden' });
    const parsed = UpdateAttachmentInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { attachmentId, name, showOnWeb } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdateAttachmentError>> => {
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
          ownerTarget('attachment_updated', attachment.owner),
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
