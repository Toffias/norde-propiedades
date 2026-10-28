import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  QuickReplyIdInputSchema,
  type QuickReplyIdInput,
  type QuickReplyRow,
} from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import {
  canManageQuickReplies,
  canUseQuickReplies,
  findQuickReply,
  toQuickReplyRow,
  type QuickReplyNotFoundError,
} from '../quick-reply-support';

export type GetQuickReplyError = ForbiddenError | InvalidInputError | QuickReplyNotFoundError;

/**
 * Una respuesta rápida, para editarla o para usarla en un envío. Quien no las administra solo ve
 * las activas: una inactiva es, para él, una que no existe.
 */
export class GetQuickReply {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork }) {}

  async execute(
    input: QuickReplyIdInput,
    actor: Actor,
  ): Promise<Result<QuickReplyRow, GetQuickReplyError>> {
    if (!canUseQuickReplies(actor)) return err({ type: 'Forbidden' });

    const parsed = QuickReplyIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));

    const reply = await this.deps.uow.run((tx) =>
      findQuickReply(tx.quickReplies, parsed.data.quickReplyId),
    );
    if (!reply || (!reply.isActive && !canManageQuickReplies(actor))) {
      return err({ type: 'QuickReplyNotFound' });
    }
    return ok(toQuickReplyRow(reply.toSnapshot()));
  }
}
