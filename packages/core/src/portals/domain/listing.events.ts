import type { DomainEvent } from '../../shared/domain/domain-event';

import type { PortalId } from './portal';

/** Hay que llevar la publicación al portal: lo hace un job, fuera del pedido del usuario. */
export type ListingSyncRequested = DomainEvent<
  'portals.listing_sync_requested',
  { readonly listingId: string; readonly propertyId: string }
>;

/** El portal rechazó la publicación o no respondió: el motivo queda en la publicación. */
export type ListingSyncFailed = DomainEvent<
  'portals.listing_sync_failed',
  {
    readonly listingId: string;
    readonly propertyId: string;
    readonly portal: PortalId;
    readonly reason: string;
  }
>;

export type ListingEvent = ListingSyncRequested | ListingSyncFailed;
