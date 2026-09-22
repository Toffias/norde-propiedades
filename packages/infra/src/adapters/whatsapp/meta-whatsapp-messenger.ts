import type {
  ChannelMessenger,
  DeliveryFailedError,
  OutboundMessage,
} from '@norde/core/conversations';
import { err, ok, type Result } from '@norde/core/shared';
import { z } from 'zod';

import type { InfraLogger } from '../../shared/logger';

export const WHATSAPP_TEXT_LIMIT = 4096;
export const WHATSAPP_CAPTION_LIMIT = 1024;
export const WHATSAPP_BUTTON_BODY_LIMIT = 1024;
export const WHATSAPP_BUTTON_TITLE_LIMIT = 20;
export const WHATSAPP_MAX_BUTTONS = 3;

const SendResponseSchema = z.object({
  messages: z.array(z.object({ id: z.string() })).optional(),
});

const ErrorResponseSchema = z.object({
  error: z.object({ code: z.number().optional(), message: z.string().optional() }).optional(),
});

export interface MetaWhatsAppMessengerOptions {
  /** Token de System User (no expira). */
  readonly accessToken: string;
  readonly phoneNumberId: string;
  readonly apiVersion: string;
  readonly baseUrl: string;
  /** Solo para el número de prueba de Meta. Ver `stripArgentineNine`. */
  readonly stripArgentineNine: boolean;
  readonly logger: InfraLogger;
  readonly fetch?: typeof fetch;
  /** Espera antes del único reintento (en tests, 0). */
  readonly retryDelayMs?: number;
}

type PostOutcome =
  | { readonly kind: 'ok'; readonly body: unknown }
  | { readonly kind: 'rejected'; readonly status: number; readonly body: unknown }
  | { readonly kind: 'unreachable'; readonly error: unknown };

/** WhatsApp Cloud API de Meta, sin SDK (portado del MVP APZ-WP-BOT). */
export class MetaWhatsAppMessenger implements ChannelMessenger {
  readonly #endpoint: string;
  readonly #fetch: typeof fetch;

  constructor(private readonly options: MetaWhatsAppMessengerOptions) {
    this.#endpoint = `${options.baseUrl}/${options.apiVersion}/${options.phoneNumberId}/messages`;
    this.#fetch = options.fetch ?? fetch;
  }

  async send(
    to: string,
    message: OutboundMessage,
  ): Promise<Result<{ readonly channelMessageId: string | undefined }, DeliveryFailedError>> {
    const recipient = this.options.stripArgentineNine ? stripArgentineNine(to) : to;
    const outcome = await this.post({ to: recipient, ...toPayload(message) });

    switch (outcome.kind) {
      case 'ok': {
        const id = SendResponseSchema.safeParse(outcome.body).data?.messages?.[0]?.id;
        if (!id)
          this.options.logger.warn({ type: message.type }, 'WhatsApp response without message id');
        return ok({ channelMessageId: id });
      }
      case 'rejected': {
        const code = ErrorResponseSchema.safeParse(outcome.body).data?.error?.code;
        return err({
          type: 'DeliveryFailed',
          reason: `whatsapp http ${outcome.status}${code === undefined ? '' : ` code ${code}`}`,
        });
      }
      case 'unreachable':
        this.options.logger.error({ err: outcome.error }, 'WhatsApp API unreachable');
        return err({ type: 'DeliveryFailed', reason: 'whatsapp unreachable' });
    }
  }

  /** Doble tilde azul. No tiene costo; si falla, solo se registra. */
  async markAsRead(channelMessageId: string): Promise<void> {
    const outcome = await this.post({ status: 'read', message_id: channelMessageId });
    if (outcome.kind !== 'ok') {
      this.options.logger.warn(
        { outcome: outcome.kind },
        'Could not mark WhatsApp message as read',
      );
    }
  }

  private async post(body: Record<string, unknown>): Promise<PostOutcome> {
    const request = () =>
      this.#fetch(this.#endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          ...body,
        }),
        signal: AbortSignal.timeout(15_000),
      });

    // Un solo reintento y solo ante fallos transitorios (red, 5xx, 429). Un 4xx (ventana de
    // 24 h cerrada, número inválido, token vencido) no se reintenta: fallaría igual y en un
    // envío que sí llegó se cobraría doble.
    let response: Response;
    try {
      response = await request();
      if (response.status >= 500 || response.status === 429) {
        this.options.logger.warn(
          { status: response.status },
          'WhatsApp API transient error, retrying',
        );
        await this.pause();
        response = await request();
      }
    } catch (error) {
      this.options.logger.warn({ err: error }, 'WhatsApp API network error, retrying');
      await this.pause();
      try {
        response = await request();
      } catch (retryError) {
        return { kind: 'unreachable', error: retryError };
      }
    }

    const json: unknown = await response.json().catch(() => ({}));
    return response.ok
      ? { kind: 'ok', body: json }
      : { kind: 'rejected', status: response.status, body: json };
  }

  private pause(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.options.retryDelayMs ?? 1500));
  }
}

function toPayload(message: OutboundMessage): Record<string, unknown> {
  switch (message.type) {
    case 'text':
      return {
        type: 'text',
        text: { preview_url: true, body: truncate(message.text, WHATSAPP_TEXT_LIMIT) },
      };
    case 'image':
      return {
        type: 'image',
        image: {
          link: message.imageUrl,
          ...(message.caption
            ? { caption: truncate(message.caption, WHATSAPP_CAPTION_LIMIT) }
            : {}),
        },
      };
    case 'buttons':
      return {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: truncate(message.text, WHATSAPP_BUTTON_BODY_LIMIT) },
          action: {
            buttons: message.buttons.slice(0, WHATSAPP_MAX_BUTTONS).map((b) => ({
              type: 'reply',
              reply: { id: b.id, title: truncate(b.title, WHATSAPP_BUTTON_TITLE_LIMIT) },
            })),
          },
        },
      };
  }
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Quita el 9 de los celulares argentinos: 5491166899124 → 541166899124.
 *
 * Rodeo para el número de prueba de Meta, no una regla de la Cloud API: la lista de
 * destinatarios autorizados del número de prueba solo reconoce la forma sin el 9 (error
 * 131030). En producción se responde al identificador tal cual llega; va apagado.
 */
export function stripArgentineNine(to: string): string {
  const match = /^549(\d{10})$/.exec(to);
  return match ? `54${match[1] ?? ''}` : to;
}
