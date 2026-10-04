import {
  auditAction,
  err,
  MergedClientInputSchema,
  ok,
  type Actor,
  type ForbiddenError,
  type MergedClientInput,
  type Result,
} from '../../../shared';
import type { ConversationsUnitOfWork } from '../ports/conversations-transaction';

export interface InvalidMergeInputError {
  readonly type: 'InvalidInput';
}

export type MoveMergedClientConversationsError = ForbiddenError | InvalidMergeInputError;

/**
 * Reacción a `clients.clients_merged`: las conversaciones del agente de IA con el duplicado pasan
 * al contacto que queda, con sus mensajes. Cada una lo deja en su historial, con los dos IDs.
 * Idempotente: una segunda vez no encuentra nada que mover.
 */
export class MoveMergedClientConversations {
  constructor(private readonly deps: { readonly uow: ConversationsUnitOfWork }) {}

  async execute(
    input: MergedClientInput,
    actor: Actor,
  ): Promise<Result<{ readonly moved: number }, MoveMergedClientConversationsError>> {
    if (!actor.can('conversations:merge-client-data')) return err({ type: 'Forbidden' });
    const parsed = MergedClientInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'InvalidInput' });
    const { clientId, mergedClientId } = parsed.data;

    const moved = await this.deps.uow.run(async (tx) => {
      const conversationIds = await tx.clientMerge.moveClient(mergedClientId, clientId);
      for (const conversationId of conversationIds) {
        await tx.audit.record(
          auditAction(
            actor,
            {
              action: 'conversation.client_merged',
              entityType: 'conversation',
              entityId: conversationId,
              clientIds: [clientId, mergedClientId],
            },
            { clientId: { before: mergedClientId, after: clientId } },
          ),
        );
      }
      return conversationIds.length;
    });
    return ok({ moved });
  }
}
