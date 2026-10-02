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

export type ClientEvent = ClientRegistered | ClientChannelAdded | ClientDeleted | ClientRestored;
