import { z } from 'zod';

/** Largo máximo de un mensaje del visitante (el mismo recorte que aplica el agente). */
export const CHAT_MAX_CHARS = 1000;

/** Lo que manda el widget por cada mensaje. */
export const ChatMessageInputSchema = z.object({
  /** Lo genera el navegador: un reintento con el mismo ID no se responde dos veces. */
  messageId: z.uuid(),
  text: z.string().trim().min(1).max(CHAT_MAX_CHARS),
});

export type ChatMessageInput = z.infer<typeof ChatMessageInputSchema>;

/** Respuesta del agente, tal como la dibuja el widget. */
export interface ChatReply {
  /** Markdown liviano: negrita, listas y links. */
  readonly text: string;
  readonly photoUrl: string | null;
  readonly buttons: readonly { readonly id: string; readonly title: string }[];
}

export type ChatActionResult =
  /** `reply: null` cuando el agente no tiene nada que decir (por ejemplo, a un "gracias"). */
  | { readonly status: 'ok'; readonly reply: ChatReply | null }
  | { readonly status: 'error'; readonly message: string };
