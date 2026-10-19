import type { OutboundMessage } from '@norde/core/conversations';

import type { CustomerTurnContext } from '../../assistant/turn-context';

export const FALLBACK_TEXT =
  'Perdón, tuve un problema para procesar tu mensaje. ¿Me lo repetís en un momento?';

export const UNSUPPORTED_TEXT =
  'Por ahora solo puedo leer mensajes de texto. ¿Me contás por escrito qué estás buscando?';

const TEXT_LIMIT = 4096;
const SHORT_BODY_LIMIT = 1024;

/** Lo que dibuja el widget del sitio: el texto (markdown liviano), una foto y botones. */
export interface WebChatReplyView {
  readonly text: string;
  readonly photoUrl: string | null;
  readonly buttons: readonly { readonly id: string; readonly title: string }[];
}

/** La respuesta para el widget y el mensaje equivalente del core, que queda registrado. */
export interface WebChatReply {
  readonly view: WebChatReplyView;
  readonly stored: OutboundMessage;
}

/**
 * Arma la respuesta del chat del sitio con el texto final del agente y lo que pidieron las
 * tools. En la web no hay costo por mensaje: el texto, la foto y los botones van juntos.
 */
export function buildWebChatReply(
  finalText: string | undefined,
  context: Pick<CustomerTurnContext, 'photo' | 'buttons'>,
): WebChatReply {
  const text = (finalText ?? '').trim().slice(0, TEXT_LIMIT) || FALLBACK_TEXT;
  const buttons = context.buttons ?? [];
  const view = { text, photoUrl: context.photo?.url ?? null, buttons };

  if (buttons.length > 0 && text.length <= SHORT_BODY_LIMIT) {
    return { view, stored: { type: 'buttons', text, buttons: [...buttons] } };
  }
  if (context.photo && text.length <= SHORT_BODY_LIMIT) {
    return { view, stored: { type: 'image', imageUrl: context.photo.url, caption: text } };
  }
  return { view, stored: { type: 'text', text } };
}

/** Respuesta de texto fijo (aviso o error), sin foto ni botones. */
export function plainReply(text: string): WebChatReply {
  return { view: { text, photoUrl: null, buttons: [] }, stored: { type: 'text', text } };
}
