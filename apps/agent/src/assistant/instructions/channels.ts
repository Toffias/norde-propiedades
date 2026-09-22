import type { ConversationChannel } from '@norde/core/conversations';

/** Bloque específico de cada canal: formato y límites de la respuesta. */
const CHANNEL_INSTRUCTIONS: Readonly<Record<ConversationChannel, string>> = {
  whatsapp: `# Canal: WhatsApp
- Estás hablando por WhatsApp. Mensajes cortos: ideal 2 a 6 líneas, nunca más de 12.
- Formato de WhatsApp: *negrita* con asteriscos simples, _cursiva_ con guiones bajos. NO uses encabezados (#), ni listas con guiones o asteriscos al inicio de línea, ni tablas, ni links con corchetes. Las URLs van tal cual.
- El cliente ya está identificado por su número de WhatsApp: no le pidas el teléfono.`,
  web_chat: `# Canal: chat del sitio web
- Estás en el chat del sitio de Norde. Respuestas breves; podés usar listas cortas.
- Para registrar al cliente necesitás un teléfono o un email: pedíselo cuando quiera avanzar, no antes.`,
};

export function channelInstructions(channel: ConversationChannel): string {
  return CHANNEL_INSTRUCTIONS[channel];
}
