import type { OutboundMessage } from '@norde/core/conversations';

import type { CustomerTurnContext, ShownProperty } from '../../assistant/turn-context';

export const FALLBACK_TEXT =
  'Perdón, tuve un problema para procesar tu mensaje. ¿Me lo repetís en un momento?';

export const UNSUPPORTED_TEXT =
  'Por ahora solo puedo leer mensajes de texto. ¿Me contás por escrito qué estás buscando?';

const TEXT_LIMIT = 4096;
const SHORT_BODY_LIMIT = 1024;
/** Tarjetas por respuesta: el agente muestra hasta 3 propiedades, con margen por si suma otra. */
const MAX_CARDS = 6;

/** La tarjeta de una propiedad en el chat: foto, nombre, datos básicos y link a la ficha. */
export type WebChatPropertyCard = ShownProperty;

/** Lo que dibuja el widget del sitio: el texto (markdown liviano), una foto, tarjetas y botones. */
export interface WebChatReplyView {
  readonly text: string;
  readonly photoUrl: string | null;
  readonly cards: readonly WebChatPropertyCard[];
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
  context: Pick<CustomerTurnContext, 'photo' | 'buttons' | 'shownProperties'>,
): WebChatReply {
  const text = (finalText ?? '').trim().slice(0, TEXT_LIMIT) || FALLBACK_TEXT;
  const buttons = context.buttons ?? [];
  const view = {
    text,
    photoUrl: context.photo?.url ?? null,
    cards: mentionedProperties(text, [...context.shownProperties.values()]),
    buttons,
  };

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
  return {
    view: { text, photoUrl: null, cards: [], buttons: [] },
    stored: { type: 'text', text },
  };
}

/**
 * Las propiedades que el agente nombró con el link de su ficha, en el orden del texto. Las que
 * vio pero no mencionó (otros resultados de la búsqueda) no llevan tarjeta.
 */
export function mentionedProperties(
  text: string,
  shown: readonly ShownProperty[],
): WebChatPropertyCard[] {
  return shown
    .map((property) => ({ property, at: mentionIndex(text, property.url) }))
    .filter((entry) => entry.at >= 0)
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_CARDS)
    .map((entry) => entry.property);
}

/** Dónde aparece la ficha en el texto (con o sin dominio), o -1. */
function mentionIndex(text: string, url: string): number {
  const path = new URL(url).pathname;
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // `-p-01` no tiene que coincidir con `-p-010`.
  return text.search(new RegExp(`${escaped}(?![\\w-])`));
}
