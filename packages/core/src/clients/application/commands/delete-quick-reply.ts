import {
  auditAction,
  diffChanges,
  err,
  ok,
  type Actor,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { QuickReplyIdInputSchema, type QuickReplyIdInput } from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import {
  canManageQuickReplies,
  findQuickReply,
  quickReplyAuditState,
  quickReplyTarget,
  type QuickReplyNotFoundError,
} from '../quick-reply-support';

export type DeleteQuickReplyError = ForbiddenError | InvalidInputError | QuickReplyNotFoundError;

/**
 * Borra una respuesta rápida (`quick-replies:manage`). Los envíos que ya la usaron no cambian: el
 * mensaje se copió al enviarlo. Queda en la auditoría con todos sus valores, por si hay que volver
 * a cargarla.
 */
export class DeleteQuickReply {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork }) {}

  async execute(
    input: QuickReplyIdInput,
    actor: Actor,
  ): Promise<Result<void, DeleteQuickReplyError>> {
    if (!canManageQuickReplies(actor)) return err({ type: 'Forbidden' });

    const parsed = QuickReplyIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));

    return this.deps.uow.run(async (tx): Promise<Result<void, DeleteQuickReplyError>> => {
      const reply = await findQuickReply(tx.quickReplies, parsed.data.quickReplyId);
      if (!reply) return err({ type: 'QuickReplyNotFound' });
      const before = quickReplyAuditState(reply);
      await tx.quickReplies.delete(reply.id);
      await tx.audit.record(
        auditAction(
          actor,
          quickReplyTarget('quick_reply.deleted', reply.id),
          diffChanges(before, {}),
        ),
      );
      return ok(undefined);
    });
  }
}
