import type {
  ChannelMessenger,
  DeliveryFailedError,
  OutboundMessage,
} from '@norde/core/conversations';
import { ok, type Result } from '@norde/core/shared';

/**
 * Canal del chat del sitio: la respuesta viaja en la misma respuesta HTTP que trajo el mensaje,
 * así que "enviar" es solo registrarla. No hay ID del canal ni acuse de lectura.
 */
export class WebChatMessenger implements ChannelMessenger {
  send(
    _to: string,
    _message: OutboundMessage,
  ): Promise<Result<{ channelMessageId: string | undefined }, DeliveryFailedError>> {
    return Promise.resolve(ok({ channelMessageId: undefined }));
  }

  markAsRead(_channelMessageId: string): Promise<void> {
    return Promise.resolve();
  }
}
