import type { InboundMessage } from '@norde/core/conversations';
import { z } from 'zod';

// Subconjunto del webhook de WhatsApp Cloud API que usa el agente. Lo desconocido se ignora
// (Meta agrega campos seguido); lo que usamos se valida.

const MessageSchema = z.object({
  from: z.string().min(1),
  id: z.string().min(1),
  timestamp: z.string().regex(/^\d+$/),
  type: z.string().min(1),
  text: z.object({ body: z.string() }).optional(),
  interactive: z
    .object({
      button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
      list_reply: z.object({ id: z.string(), title: z.string() }).optional(),
    })
    .optional(),
  button: z.object({ text: z.string() }).optional(),
  errors: z.array(z.unknown()).optional(),
});

const WebhookPayloadSchema = z.object({
  object: z.string(),
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              field: z.string(),
              value: z.object({
                metadata: z.object({ phone_number_id: z.string() }),
                contacts: z
                  .array(
                    z.object({
                      wa_id: z.string(),
                      profile: z.object({ name: z.string() }).optional(),
                    }),
                  )
                  .optional(),
                messages: z.array(z.unknown()).optional(),
              }),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

/** Mensaje entrante normalizado, listo para el caso de uso `ReceiveInboundMessages`. */
export interface WhatsAppInbound {
  readonly phoneNumberId: string;
  /** wa_id del remitente: el número en formato internacional sin `+`. */
  readonly from: string;
  readonly profileName: string | undefined;
  readonly message: InboundMessage;
}

/**
 * Convierte el payload del webhook en mensajes. Ignora los eventos de estado (enviado,
 * entregado, leído), los mensajes con error y los que no se pueden interpretar.
 */
export function parseInbound(payload: unknown): WhatsAppInbound[] {
  const parsed = WebhookPayloadSchema.safeParse(payload);
  if (!parsed.success || parsed.data.object !== 'whatsapp_business_account') return [];

  const out: WhatsAppInbound[] = [];
  for (const entry of parsed.data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      const { value } = change;
      const names = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));

      for (const raw of value.messages ?? []) {
        const message = MessageSchema.safeParse(raw);
        if (!message.success || (message.data.errors?.length ?? 0) > 0) continue;
        const m = message.data;
        out.push({
          phoneNumberId: value.metadata.phone_number_id,
          from: m.from,
          profileName: names.get(m.from),
          message: {
            channelMessageId: m.id,
            sentAt: new Date(Number(m.timestamp) * 1000),
            rawType: m.type,
            ...content(m),
          },
        });
      }
    }
  }
  return out;
}

function content(m: z.infer<typeof MessageSchema>): Pick<InboundMessage, 'kind' | 'text'> {
  if (m.type === 'text' && m.text) return { kind: 'text', text: m.text.body };
  const reply = m.interactive?.button_reply ?? m.interactive?.list_reply;
  if (m.type === 'interactive' && reply) return { kind: 'button', text: reply.title };
  if (m.type === 'button' && m.button) return { kind: 'button', text: m.button.text };
  // Audio, imagen, sticker, ubicación…: por ahora el agente solo lee texto.
  return { kind: 'unsupported', text: '' };
}
