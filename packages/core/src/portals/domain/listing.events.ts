import type { DomainEvent } from '../../shared/domain/domain-event';

import type { ListingOwnerKind, PortalId } from './portal';

/** Hay que llevar la publicación al portal: lo hace un job, fuera del pedido del usuario. */
export type ListingSyncRequested = DomainEvent<
  'portals.listing_sync_requested',
  { readonly listingId: string; readonly ownerKind: ListingOwnerKind; readonly ownerId: string }
>;

/** El portal rechazó la publicación o no respondió: el motivo queda en la publicación. */
export type ListingSyncFailed = DomainEvent<
  'portals.listing_sync_failed',
  {
    readonly listingId: string;
    readonly ownerKind: ListingOwnerKind;
    readonly ownerId: string;
    readonly portal: PortalId;
    readonly reason: string;
  }
>;

export type ListingEvent = ListingSyncRequested | ListingSyncFailed;

/** El portal avisó que hay contactos nuevos: un job los trae a la bandeja. */
export type PortalLeadsArrived = DomainEvent<
  'portals.leads_arrived',
  { readonly portal: PortalId }
>;
