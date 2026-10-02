import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { ConversationEvent } from './conversation.events';

export type ConversationId = Id<'Conversation'>;

export const CONVERSATION_CHANNELS = ['whatsapp', 'web_chat'] as const;
export type ConversationChannel = (typeof CONVERSATION_CHANNELS)[number];

export const CONVERSATION_STATUSES = ['active', 'handed_off', 'closed'] as const;
/** `active`: responde el bot. `handed_off`: la atiende una persona y el bot calla. */
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

/**
 * Memoria del agente de IA (los ítems de su historial). Para el dominio es opaca: la
 * interpreta el runtime del agente, acá solo se guarda, se recorta y se reinicia.
 */
export type AgentMemory = readonly unknown[];

export interface ConversationSnapshot {
  readonly id: ConversationId;
  readonly channel: ConversationChannel;
  /** Identidad en el canal: el número en WhatsApp, la sesión en el web chat. */
  readonly externalId: string;
  readonly contactName: string | undefined;
  readonly clientId: string | undefined;
  readonly status: ConversationStatus;
  readonly agentMemory: AgentMemory;
  /** Última búsqueda que hizo el agente, para retomarla. Opaca para el dominio. */
  readonly searchCriteria: unknown;
  readonly startedAt: Date;
  readonly lastActivityAt: Date;
}

export interface InvalidConversationTransitionError {
  readonly type: 'InvalidConversationTransition';
  readonly from: ConversationStatus;
  readonly to: ConversationStatus;
}

const MAX_CONTACT_NAME_LENGTH = 120;

/** Nombre de perfil del canal, recortado. Vacío cuenta como sin nombre. */
function cleanContactName(name: string | undefined): string | undefined {
  const trimmed = name?.trim().slice(0, MAX_CONTACT_NAME_LENGTH);
  return trimmed === '' ? undefined : trimmed;
}

export class Conversation extends AggregateRoot<ConversationId, ConversationEvent> {
  #state: Omit<ConversationSnapshot, 'id'>;

  private constructor(id: ConversationId, state: Omit<ConversationSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static start(input: {
    readonly id: ConversationId;
    readonly channel: ConversationChannel;
    readonly externalId: string;
    readonly contactName?: string | undefined;
    readonly now: Date;
  }): Conversation {
    const conversation = new Conversation(input.id, {
      channel: input.channel,
      externalId: input.externalId,
      contactName: cleanContactName(input.contactName),
      clientId: undefined,
      status: 'active',
      agentMemory: [],
      searchCriteria: undefined,
      startedAt: input.now,
      lastActivityAt: input.now,
    });
    conversation.record({
      type: 'conversations.conversation_started',
      aggregateId: input.id,
      occurredAt: input.now,
      payload: { conversationId: input.id, channel: input.channel },
    });
    return conversation;
  }

  static restore(snapshot: ConversationSnapshot): Conversation {
    const { id, ...state } = snapshot;
    return new Conversation(id, state);
  }

  get channel(): ConversationChannel {
    return this.#state.channel;
  }

  get externalId(): string {
    return this.#state.externalId;
  }

  get contactName(): string | undefined {
    return this.#state.contactName;
  }

  get clientId(): string | undefined {
    return this.#state.clientId;
  }

  get status(): ConversationStatus {
    return this.#state.status;
  }

  get agentMemory(): AgentMemory {
    return this.#state.agentMemory;
  }

  get searchCriteria(): unknown {
    return this.#state.searchCriteria;
  }

  /** El bot responde solo si nadie del equipo tomó la conversación. */
  canBotReply(): boolean {
    return this.#state.status === 'active';
  }

  /**
   * El contacto escribió. Tras un período de inactividad la conversación arranca de cero:
   * se olvida la memoria del agente y, si la había tomado una persona, vuelve al bot.
   */
  registerInbound(input: {
    readonly now: Date;
    readonly contactName?: string | undefined;
    readonly idleResetAfterMs: number;
  }): { readonly memoryReset: boolean } {
    const idleMs = input.now.getTime() - this.#state.lastActivityAt.getTime();
    const memoryReset = idleMs > input.idleResetAfterMs && this.#state.agentMemory.length > 0;

    this.#state = {
      ...this.#state,
      contactName: cleanContactName(input.contactName) ?? this.#state.contactName,
      lastActivityAt: input.now,
      ...(memoryReset
        ? {
            agentMemory: [],
            searchCriteria: undefined,
            status: this.#state.status === 'handed_off' ? 'active' : this.#state.status,
          }
        : {}),
    };
    return { memoryReset };
  }

  /** Guarda lo que el agente recuerda después de responder un turno. */
  recordAgentTurn(input: { readonly memory: AgentMemory; readonly searchCriteria?: unknown }) {
    this.#state = {
      ...this.#state,
      agentMemory: input.memory,
      searchCriteria: input.searchCriteria ?? this.#state.searchCriteria,
    };
  }

  /** Vincula la conversación al cliente que se registró en ella. */
  linkClient(clientId: string, now: Date): void {
    if (this.#state.clientId === clientId) return;
    this.#state = { ...this.#state, clientId };
    this.record({
      type: 'conversations.conversation_linked_to_client',
      aggregateId: this.id,
      occurredAt: now,
      payload: { conversationId: this.id, clientId, channel: this.#state.channel },
    });
  }

  /** Una persona del equipo toma la conversación: el bot deja de responder. */
  handOff(now: Date): Result<void, InvalidConversationTransitionError> {
    if (this.#state.status !== 'active') {
      return err({
        type: 'InvalidConversationTransition',
        from: this.#state.status,
        to: 'handed_off',
      });
    }
    this.#state = { ...this.#state, status: 'handed_off' };
    this.record({
      type: 'conversations.conversation_handed_off',
      aggregateId: this.id,
      occurredAt: now,
      payload: { conversationId: this.id },
    });
    return ok(undefined);
  }

  returnToBot(now: Date): Result<void, InvalidConversationTransitionError> {
    if (this.#state.status !== 'handed_off') {
      return err({ type: 'InvalidConversationTransition', from: this.#state.status, to: 'active' });
    }
    this.#state = { ...this.#state, status: 'active' };
    this.record({
      type: 'conversations.conversation_returned_to_bot',
      aggregateId: this.id,
      occurredAt: now,
      payload: { conversationId: this.id },
    });
    return ok(undefined);
  }

  toSnapshot(): ConversationSnapshot {
    return { id: this.id, ...this.#state };
  }
}
