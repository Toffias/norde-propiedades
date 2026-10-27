import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { SetQuickReplyActiveInputSchema, type SetQuickReplyActiveInput } from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import {
  canManageQuickReplies,
  findQuickReply,
  quickReplyTarget,
  type QuickReplyNotFoundError,
} from '../quick-reply-support';

export type SetQuickReplyActiveError = ForbiddenError | InvalidInputError | QuickReplyNotFoundError;

/** Activa o inactiva una respuesta rápida (`quick-replies:manage`). Las inactivas no se ofrecen. */
export class SetQuickReplyActive {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: SetQuickReplyActiveInput,
    actor: Actor,
  ): Promise<Result<void, SetQuickReplyActiveError>> {
    if (!canManageQuickReplies(actor)) return err({ type: 'Forbidden' });

    const parsed = SetQuickReplyActiveInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { quickReplyId, active } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, SetQuickReplyActiveError>> => {
      const reply = await findQuickReply(tx.quickReplies, quickReplyId);
      if (!reply) return err({ type: 'QuickReplyNotFound' });
      if (!reply.setActive(active, now)) return ok(undefined);

      await tx.quickReplies.save(reply, actor.id);
      await tx.audit.record(
        auditAction(
          actor,
          quickReplyTarget(active ? 'quick_reply.activated' : 'quick_reply.deactivated', reply.id),
        ),
      );
      return ok(undefined);
    });
  }
}
