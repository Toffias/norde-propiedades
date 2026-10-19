import type { ConversationChannel } from '@norde/core/conversations';

/** Bloque específico de cada canal: formato y límites de la respuesta. */
const CHANNEL_INSTRUCTIONS: Readonly<Record<ConversationChannel, string>> = {
  whatsapp: `# Canal: WhatsApp
- Estás hablando por WhatsApp. Mensajes cortos: ideal 2 a 6 líneas, nunca más de 12.
- Formato de WhatsApp: *negrita* con asteriscos simples, _cursiva_ con guiones bajos. NO uses encabezados (#), ni listas con guiones o asteriscos al inicio de línea, ni tablas, ni links con corchetes. Las URLs van tal cual.
- El cliente ya está identificado por su número de WhatsApp: no le pidas el teléfono.`,
  web_chat: `# Canal: chat del sitio web
- Estás en el chat del sitio de Norde. Respuestas breves; podés usar listas cortas.
- Formato: **negrita** con doble asterisco, listas con "- " o "1. " al inicio de línea y links como [texto](url). NO uses encabezados (#) ni tablas.
- Cada propiedad que nombres con el link de su ficha se muestra debajo de tu mensaje como una tarjeta con la foto, el precio, la ubicación, los ambientes y los m². Por eso NO repitas esos datos en el texto: por cada propiedad, una línea con el link en el título ([2 ambientes en Palermo](url)) y, si suma, un detalle breve que no esté en la tarjeta (luminoso, a estrenar, con balcón).
- Para registrar al cliente necesitás un teléfono o un email: pedíselo cuando quiera avanzar, no antes.`,
};

export function channelInstructions(channel: ConversationChannel): string {
  return CHANNEL_INSTRUCTIONS[channel];
}
