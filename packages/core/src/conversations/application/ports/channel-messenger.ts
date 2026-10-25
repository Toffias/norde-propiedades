import type { Result } from '../../../shared';
import type { OutboundMessage } from '../../contracts';

export interface DeliveryFailedError {
  readonly type: 'DeliveryFailed';
  /** Motivo técnico para el log (sin datos personales). */
  readonly reason: string;
}

/**
 * Envía mensajes por un canal (WhatsApp Cloud API, web chat). La implementación decide los
 * reintentos: nunca reintenta un rechazo del canal (4xx), porque en WhatsApp se cobraría doble.
 */
export interface ChannelMessenger {
  send(
    to: string,
    message: OutboundMessage,
  ): Promise<Result<{ readonly channelMessageId: string | undefined }, DeliveryFailedError>>;
  /**
   * Acuse de lectura. Con `typing`, además muestra "escribiendo…" hasta la respuesta (WhatsApp lo
   * apaga solo a los 25 s). Es opcional para el negocio: la implementación registra si falla.
   */
  markAsRead(channelMessageId: string, options?: { readonly typing: boolean }): Promise<void>;
}

export type ChannelMessengers = Readonly<
  Partial<Record<'whatsapp' | 'web_chat', ChannelMessenger>>
>;
