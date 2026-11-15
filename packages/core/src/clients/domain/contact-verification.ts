// Datos de contacto que nadie verificó (#221). En el chat del sitio, el teléfono y el email los
// escribe el visitante: cualquiera puede tipear los de un cliente de Norde. Con esos datos no se
// toca una ficha que no es de esa charla (restaurarla de la papelera, sumarle el canal, completarle
// nombre, email o teléfono, vincularle la conversación): queda una consulta para que una persona
// la revise. En WhatsApp el número lo da el canal, y en los portales y formularios llegan por
// webhooks firmados.

import type { Client } from './client';
import type { ContactChannel } from './contact-channel';

const UNVERIFIED_CONTACT_CHANNELS: ReadonlySet<ContactChannel> = new Set(['web_chat']);

/** Clientes que puede registrar una misma charla sin verificar: una charla es una persona. */
export const MAX_CLIENTS_PER_UNVERIFIED_CONVERSATION = 1;

export function contactDataIsVerified(channel: ContactChannel): boolean {
  return !UNVERIFIED_CONTACT_CHANNELS.has(channel);
}

/**
 * Si el registro tiene que pasar por una persona en vez de tocar clientes:
 * - coincide con un cliente que no llegó por esta charla, o
 * - no coincide con ninguno, pero la charla ya registró a otro (no se crean clientes en serie).
 */
export function unverifiedContactNeedsReview(input: {
  readonly channel: ContactChannel;
  readonly channelExternalId: string;
  readonly existing: Client | undefined;
  /** Clientes que ya se comunicaron por esta charla. */
  readonly clientsInConversation: number;
}): boolean {
  if (contactDataIsVerified(input.channel)) return false;
  if (input.existing)
    return !input.existing.isReachedThrough(input.channel, input.channelExternalId);
  return input.clientsInConversation >= MAX_CLIENTS_PER_UNVERIFIED_CONVERSATION;
}
