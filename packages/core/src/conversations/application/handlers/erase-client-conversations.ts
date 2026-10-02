import {
  ErasedClientsInputSchema,
  err,
  ok,
  type Actor,
  type ErasedClientsInput,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import type { ClientConversationErasure } from '../ports/client-conversation-erasure';

export interface InvalidErasureInputError {
  readonly type: 'InvalidInput';
}

export type EraseClientConversationsError = ForbiddenError | InvalidErasureInputError;

/**
 * Reacción a `clients.client_erased`: borra físicamente las conversaciones del agente de IA con
 * esos clientes y sus mensajes. Idempotente: lo que ya se borró no está. No se audita: la
 * constancia de la supresión la deja clients.
 */
export class EraseClientConversations {
  constructor(private readonly deps: { readonly erasure: ClientConversationErasure }) {}

  async execute(
    input: ErasedClientsInput,
    actor: Actor,
  ): Promise<Result<{ readonly erased: number }, EraseClientConversationsError>> {
    if (!actor.can('conversations:erase-client-data')) return err({ type: 'Forbidden' });
    const parsed = ErasedClientsInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'InvalidInput' });
    return ok({ erased: await this.deps.erasure.eraseForClients(parsed.data.clientIds) });
  }
}
