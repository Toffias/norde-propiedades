// Contracts del módulo conversations (`@norde/core/conversations/contracts`).
// Los valores de los enums replican los del dominio (un test verifica que coincidan).

import { z } from 'zod';

export const CONVERSATION_CHANNEL_VALUES = ['whatsapp', 'web_chat'] as const;
export const INBOUND_MESSAGE_KINDS = ['text', 'button', 'unsupported'] as const;

export const InboundMessageSchema = z.object({
  /** ID del mensaje en el canal (wamid de WhatsApp): clave de idempotencia. */
  channelMessageId: z.string().min(1).max(200),
  /** `button`: el contacto tocó un botón; `text` es su título. `unsupported`: audio, sticker… */
  kind: z.enum(INBOUND_MESSAGE_KINDS),
  text: z.string().max(10_000),
  sentAt: z.date(),
  /** Tipo original del canal (ej. `audio`), para el registro. */
  rawType: z.string().min(1).max(40),
});

export const ReceiveInboundMessagesInputSchema = z.object({
  channel: z.enum(CONVERSATION_CHANNEL_VALUES),
  externalId: z.string().trim().min(1).max(200),
  contactName: z.string().trim().max(120).optional(),
  messages: z.array(InboundMessageSchema).min(1).max(50),
});

export type InboundMessage = z.infer<typeof InboundMessageSchema>;
export type ReceiveInboundMessagesInput = z.input<typeof ReceiveInboundMessagesInputSchema>;

export const OutboundMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().min(1).max(4096) }),
  z.object({
    type: z.literal('image'),
    imageUrl: z.url({ protocol: /^https$/ }),
    caption: z.string().max(1024).optional(),
  }),
  z.object({
    type: z.literal('buttons'),
    text: z.string().min(1).max(1024),
    buttons: z
      .array(z.object({ id: z.string().min(1).max(256), title: z.string().min(1).max(20) }))
      .min(1)
      .max(3),
  }),
]);

/** Un mensaje de respuesta. Cada canal lo traduce a su formato. */
export type OutboundMessage = z.infer<typeof OutboundMessageSchema>;

/**
 * Qué hacer con los mensajes recibidos. Lo decide el core; el canal solo lo ejecuta.
 * - `ignore`: eran repetidos o viejos.
 * - `silent`: se registran pero no se responde (acuse, tope global, conversación tomada).
 * - `notice`: se responde un aviso fijo del canal (contenido no soportado, tope del contacto).
 * - `agent`: responde el agente de IA con `userText`.
 */
export type ReplyPlan =
  | { readonly action: 'ignore' }
  | {
      readonly action: 'silent';
      readonly reason: 'acknowledgement' | 'handed_off' | 'channel_limit';
    }
  | { readonly action: 'notice'; readonly notice: 'unsupported_content' | 'contact_limit' }
  | { readonly action: 'agent'; readonly userText: string };

export interface ReceiveInboundMessagesOutput {
  readonly conversationId: string;
  readonly contactName: string | undefined;
  readonly clientId: string | undefined;
  /** Memoria del agente para este turno (vacía si se reinició por inactividad). */
  readonly agentMemory: readonly unknown[];
  readonly searchCriteria: unknown;
  readonly memoryReset: boolean;
  readonly plan: ReplyPlan;
}

export interface AgentTurnUsage {
  readonly requests: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface SendReplyInput {
  readonly conversationId: string;
  readonly message: OutboundMessage;
  /** Si la respuesta es del agente: lo que recuerda después del turno. */
  readonly agentTurn?: {
    readonly memory: readonly unknown[];
    readonly searchCriteria?: unknown;
    readonly usage?: AgentTurnUsage | undefined;
  };
  /** Cliente que se registró durante el turno. */
  readonly clientId?: string | undefined;
}
