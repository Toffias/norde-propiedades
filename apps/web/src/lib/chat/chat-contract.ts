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

/** Tarjeta de una propiedad que nombró el agente: los textos ya vienen armados. */
export interface ChatPropertyCard {
  readonly id: string;
  readonly title: string;
  /** Link absoluto a la ficha. */
  readonly url: string;
  readonly photoUrl: string | null;
  /** "Venta", "Alquiler". */
  readonly operation: string;
  /** "USD 165.000", "Consultar precio". */
  readonly price: string;
  readonly location: string;
  readonly rooms: number | null;
  readonly bedrooms: number | null;
  readonly surfaceM2: number | null;
}

/** Respuesta del agente, tal como la dibuja el widget. */
export interface ChatReply {
  /** Markdown liviano: negrita, listas y links. */
  readonly text: string;
  readonly photoUrl: string | null;
  readonly cards: readonly ChatPropertyCard[];
  /** "Ver todas las opciones en la web": el listado con la búsqueda del agente, si buscó. */
  readonly listingUrl: string | null;
  readonly buttons: readonly { readonly id: string; readonly title: string }[];
}

export type ChatActionResult =
  /** `reply: null` cuando el agente no tiene nada que decir (por ejemplo, a un "gracias"). */
  | { readonly status: 'ok'; readonly reply: ChatReply | null }
  | { readonly status: 'error'; readonly message: string };
