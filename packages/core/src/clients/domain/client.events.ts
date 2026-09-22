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

export type ClientEvent = ClientRegistered | ClientChannelAdded;
