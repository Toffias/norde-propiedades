import type { OutboundMessage } from '@norde/core/conversations';

import type { CustomerTurnContext } from '../../assistant/turn-context';

export const FALLBACK_TEXT =
  'Perdón, tuve un problema para procesar tu mensaje. ¿Me lo repetís en un momento?';

const CAPTION_LIMIT = 1024;
const BUTTON_BODY_LIMIT = 1024;

/**
 * Convierte el texto final del agente, más lo que pidieron las tools, en **un** mensaje de
 * WhatsApp (cada envío se cobra). Prioridad: foto > botones > texto.
 */
export function buildWhatsAppReply(
  finalText: string | undefined,
  context: Pick<CustomerTurnContext, 'photo' | 'buttons'>,
): OutboundMessage {
  const text = cleanForWhatsApp(finalText ?? '') || FALLBACK_TEXT;

  if (context.photo) {
    return { type: 'image', imageUrl: context.photo.url, caption: text.slice(0, CAPTION_LIMIT) };
  }
  if (context.buttons && context.buttons.length > 0 && text.length <= BUTTON_BODY_LIMIT) {
    return { type: 'buttons', text, buttons: [...context.buttons] };
  }
  return { type: 'text', text };
}

/** Quita el markdown que WhatsApp no muestra y normaliza espacios. */
export function cleanForWhatsApp(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1: $2')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
