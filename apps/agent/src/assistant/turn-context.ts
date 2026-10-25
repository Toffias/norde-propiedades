import type { RegisterContactInput } from '@norde/core/clients';
import type { ConversationChannel } from '@norde/core/conversations';

/** Búsqueda del cliente, en el formato en que se guarda en su oportunidad. */
export type ContactSearch = NonNullable<RegisterContactInput['opportunity']['search']>;

/**
 * Una propiedad que el agente vio en el turno, con lo que necesita su tarjeta en el chat del
 * sitio. Los textos ya vienen armados (precio con moneda, operación en español).
 */
export interface ShownProperty {
  readonly id: string;
  readonly title: string;
  /** Link absoluto a la ficha: el agente lo escribe en su texto y así se elige la tarjeta. */
  readonly url: string;
  /** Portada por la ruta pública del sitio, o `null` si no tiene fotos. */
  readonly photoUrl: string | null;
  readonly operation: string;
  readonly price: string;
  readonly location: string;
  readonly rooms: number | null;
  readonly bedrooms: number | null;
  readonly surfaceM2: number | null;
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
  /** La búsqueda hecha en **este** turno y cuántas propiedades encontró (el chat del sitio la linkea). */
  searchResult: { readonly search: ContactSearch; readonly total: number } | undefined;
  /** Foto pedida: se envía como imagen con el texto final de epígrafe. */
  photo: { readonly url: string; readonly propertyId: string } | undefined;
  /** Opciones cerradas para responder con botones. */
  buttons: readonly { readonly id: string; readonly title: string }[] | undefined;
  /** Cliente y oportunidad registrados en este turno. */
  registration: { readonly clientId: string; readonly opportunityId: string } | undefined;
  /** Hay un registro en curso: el modelo puede llamar a la tool dos veces en paralelo. */
  registering: boolean;
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
    searchResult: undefined,
    photo: undefined,
    buttons: undefined,
    registration: undefined,
    registering: false,
  };
}
