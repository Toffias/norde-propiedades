import { createHmac } from 'node:crypto';

import { z } from 'zod';

/** Un mensaje del visitante del sitio al agente de IA (ADR 0037). */
export interface WebChatMessage {
  /** Sesión anónima del visitante (cookie de la web): identifica la conversación. */
  readonly sessionId: string;
  /** Lo genera el navegador por mensaje: un reintento con el mismo ID no se responde dos veces. */
  readonly messageId: string;
  readonly text: string;
}

const HttpUrlSchema = z.url({ protocol: /^https?$/ });

/** Tarjeta de una propiedad en el chat: los textos ya vienen armados por el agente. */
const WebChatPropertyCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: HttpUrlSchema,
  photoUrl: HttpUrlSchema.nullable(),
  operation: z.string(),
  price: z.string(),
  location: z.string(),
  rooms: z.number().nullable(),
  bedrooms: z.number().nullable(),
  surfaceM2: z.number().nullable(),
});

export type WebChatPropertyCard = z.infer<typeof WebChatPropertyCardSchema>;

/** La búsqueda del turno, para el link al listado del sitio. Precios en unidades. */
const WebChatListingSearchSchema = z.object({
  operation: z.string().nullable(),
  propertyType: z.string().nullable(),
  location: z.string().nullable(),
  currency: z.string().nullable(),
  minPrice: z.number().nullable(),
  maxPrice: z.number().nullable(),
  minRooms: z.number().nullable(),
  minBedrooms: z.number().nullable(),
  total: z.int().nonnegative(),
});

export type WebChatListingSearch = z.infer<typeof WebChatListingSearchSchema>;

const WebChatReplySchema = z.object({
  text: z.string(),
  photoUrl: HttpUrlSchema.nullable(),
  // Un agente anterior a las tarjetas no manda el campo.
  cards: z.array(WebChatPropertyCardSchema).max(10).default([]),
  listing: WebChatListingSearchSchema.nullable().default(null),
  buttons: z.array(z.object({ id: z.string(), title: z.string() })),
});

export type WebChatReply = z.infer<typeof WebChatReplySchema>;

const ResponseSchema = z.object({ reply: WebChatReplySchema.nullable() });

export type WebChatOutcome =
  /** `reply: null` cuando el agente no tiene nada que decir (un "gracias", un duplicado). */
  | { readonly kind: 'reply'; readonly reply: WebChatReply | null }
  /** La sesión mandó demasiados mensajes. */
  | { readonly kind: 'busy' }
  /** El agente no está disponible (fallas seguidas, tope diario). */
  | { readonly kind: 'unavailable' };

/** El agente tiene hasta 60 s por turno; se le da un margen. */
const TIMEOUT_MS = 90_000;

/**
 * Manda un mensaje del chat del sitio a `apps/agent` (`POST /chat/messages`), firmado con el
 * secreto compartido (`x-norde-signature: sha256=` + HMAC del body). Un error de red o del agente
 * lanza.
 */
export class WebChatClient {
  constructor(
    private readonly options: {
      /** `http://127.0.0.1:3100/chat/messages`. */
      readonly url: string;
      readonly secret: string;
      readonly fetch?: typeof fetch;
    },
  ) {}

  async send(message: WebChatMessage): Promise<WebChatOutcome> {
    const body = JSON.stringify(message);
    const signature = createHmac('sha256', this.options.secret).update(body).digest('hex');
    const response = await (this.options.fetch ?? fetch)(this.options.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-norde-signature': `sha256=${signature}` },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 429) return { kind: 'busy' };
    if (response.status === 503) return { kind: 'unavailable' };
    if (!response.ok) throw new Error(`Web chat agent responded ${response.status}`);
    const parsed = ResponseSchema.parse(await response.json());
    return { kind: 'reply', reply: parsed.reply };
  }
}
