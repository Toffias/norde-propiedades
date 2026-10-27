import type { DomainEvent } from '../../shared/domain/domain-event';

/**
 * Se le mandaron propiedades al cliente por email o WhatsApp. Dispara la regla "tras enviar
 * email o WhatsApp" sobre la oportunidad abierta del envío.
 */
export type ListingsSent = DomainEvent<
  'clients.listings_sent',
  {
    readonly sharedListingId: string;
    readonly clientId: string;
    readonly opportunityId: string | undefined;
    readonly channel: 'email' | 'whatsapp';
    readonly propertyIds: readonly string[];
  }
>;

/** El cliente marcó "me gusta" o "no me gusta" una propiedad del envío. Dispara su regla. */
export type ListingReacted = DomainEvent<
  'clients.listing_reacted',
  {
    readonly sharedListingId: string;
    readonly clientId: string;
    readonly opportunityId: string | undefined;
    readonly propertyId: string;
    readonly reaction: 'liked' | 'disliked';
  }
>;

export type SharedListingEvent = ListingsSent | ListingReacted;
