import type { DomainEvent } from '../../shared/domain/domain-event';

import type { ContactChannel } from './contact-channel';

export type ClientRegistered = DomainEvent<
  'clients.client_registered',
  { readonly clientId: string; readonly channel: ContactChannel }
>;

export type ClientChannelAdded = DomainEvent<
  'clients.client_channel_added',
  { readonly clientId: string; readonly channel: ContactChannel }
>;

export type ClientDeleted = DomainEvent<'clients.client_deleted', { readonly clientId: string }>;

export type ClientRestored = DomainEvent<'clients.client_restored', { readonly clientId: string }>;

/**
 * Se unificaron dos contactos: `mergedClientId` quedó vacío en la papelera y todo lo suyo pasó a
 * `clientId`. Los otros módulos que guardan el ID de un cliente lo reapuntan.
 */
export type ClientsMerged = DomainEvent<
  'clients.clients_merged',
  { readonly clientId: string; readonly mergedClientId: string }
>;

export type ClientEvent =
  ClientRegistered | ClientChannelAdded | ClientDeleted | ClientRestored | ClientsMerged;
