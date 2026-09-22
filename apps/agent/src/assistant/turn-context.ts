import type { RegisterContactInput } from '@norde/core/clients';
import type { ConversationChannel } from '@norde/core/conversations';

/** Búsqueda del cliente, en el formato en que se guarda en su oportunidad. */
export type ContactSearch = NonNullable<RegisterContactInput['opportunity']['search']>;

export interface ShownProperty {
  readonly id: string;
  readonly title: string;
}

/**
 * Estado de un turno del agente. Las tools lo completan y, al final, el canal arma con él
 * **un solo** mensaje de respuesta (las tools nunca envían mensajes).
 */
export interface CustomerTurnContext {
  readonly channel: ConversationChannel;
  /** Identidad en el canal (el número en WhatsApp). */
  readonly channelExternalId: string;
  /** Teléfono en formato internacional, si el canal lo conoce (WhatsApp). */
  readonly phone: string | undefined;
  readonly contactName: string | undefined;
  readonly now: Date;
  /** Propiedades que el agente vio o mostró en este turno. */
  readonly shownProperties: Map<string, ShownProperty>;
  /** Última búsqueda, para guardarla en la conversación y en la oportunidad. */
  lastSearch: ContactSearch | undefined;
  /** Foto pedida: se envía como imagen con el texto final de epígrafe. */
  photo: { readonly url: string; readonly propertyId: string } | undefined;
  /** Opciones cerradas para responder con botones. */
  buttons: readonly { readonly id: string; readonly title: string }[] | undefined;
  /** Cliente y oportunidad registrados en este turno. */
  registration: { readonly clientId: string; readonly opportunityId: string } | undefined;
}

export function createTurnContext(input: {
  readonly channel: ConversationChannel;
  readonly channelExternalId: string;
  readonly phone?: string | undefined;
  readonly contactName?: string | undefined;
  readonly previousSearch?: ContactSearch | undefined;
  readonly now: Date;
}): CustomerTurnContext {
  return {
    channel: input.channel,
    channelExternalId: input.channelExternalId,
    phone: input.phone,
    contactName: input.contactName,
    now: input.now,
    shownProperties: new Map(),
    lastSearch: input.previousSearch,
    photo: undefined,
    buttons: undefined,
    registration: undefined,
  };
}
