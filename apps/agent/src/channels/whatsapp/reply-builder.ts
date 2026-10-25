import type { OutboundMessage } from '@norde/core/conversations';

import type { CustomerTurnContext } from '../../assistant/turn-context';

export const FALLBACK_TEXT =
  'Perdón, tuve un problema para procesar tu mensaje. ¿Me lo repetís en un momento?';

const CAPTION_LIMIT = 1024;
const BUTTON_BODY_LIMIT = 1024;

/**
 * Convierte el texto final del agente, más lo que pidieron las tools, en **un** mensaje de
 * WhatsApp (cada envío se cobra). Foto y botones juntos van como botones con la foto de
 * encabezado; si no, prioridad: foto > botones > texto.
 */
export function buildWhatsAppReply(
  finalText: string | undefined,
  context: Pick<CustomerTurnContext, 'photo' | 'buttons'>,
): OutboundMessage {
  const text = cleanForWhatsApp(finalText ?? '') || FALLBACK_TEXT;

  const buttons = context.buttons && context.buttons.length > 0 ? context.buttons : undefined;
  if (buttons && text.length <= BUTTON_BODY_LIMIT) {
    return {
      type: 'buttons',
      text,
      buttons: [...buttons],
      ...(context.photo ? { imageUrl: context.photo.url } : {}),
    };
  }
  if (context.photo) {
    return { type: 'image', imageUrl: context.photo.url, caption: text.slice(0, CAPTION_LIMIT) };
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
