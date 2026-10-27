import {
  auditUpdated,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { UpdateQuickReplyInputSchema, type UpdateQuickReplyInput } from '../../contracts';
import type { InvalidQuickReplyError } from '../../domain/quick-reply';
import { invalidInput, type InvalidInputError } from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import {
  canManageQuickReplies,
  findQuickReply,
  quickReplyAuditState,
  quickReplyTarget,
  type QuickReplyNotFoundError,
} from '../quick-reply-support';

export type UpdateQuickReplyError =
  ForbiddenError | InvalidInputError | InvalidQuickReplyError | QuickReplyNotFoundError;

/** Edita el nombre, el asunto y el mensaje de una respuesta rápida (`quick-replies:manage`). */
export class UpdateQuickReply {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: UpdateQuickReplyInput,
    actor: Actor,
  ): Promise<Result<void, UpdateQuickReplyError>> {
    if (!canManageQuickReplies(actor)) return err({ type: 'Forbidden' });

    const parsed = UpdateQuickReplyInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { quickReplyId, name, subject, body } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdateQuickReplyError>> => {
      const reply = await findQuickReply(tx.quickReplies, quickReplyId);
      if (!reply) return err({ type: 'QuickReplyNotFound' });
      const before = quickReplyAuditState(reply);
      const changed = reply.edit({ name, subject, body }, now);
      if (changed.isErr()) return err(changed.error);
      if (!changed.value) return ok(undefined);

      await tx.quickReplies.save(reply, actor.id);
      const entry = auditUpdated(
        actor,
        quickReplyTarget('quick_reply.updated', reply.id),
        before,
        quickReplyAuditState(reply),
      );
      if (entry) await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}
