import type { ListingOwnerKind, PortalId } from '../../domain/portal';

/** Los estados de una publicación vinculada: tiene un aviso vivo en el portal. */
export const LINKED_LISTING_STATUSES = ['published', 'paused', 'error'] as const;
export type LinkedListingStatus = (typeof LINKED_LISTING_STATUSES)[number];

/** Cuántas publicaciones de un portal, de un tipo de aviso y en un estado, están vinculadas. */
export interface PortalListingCount {
  readonly portal: PortalId;
  readonly ownerKind: ListingOwnerKind;
  readonly status: LinkedListingStatus;
  readonly count: number;
}

/**
 * Cuenta las publicaciones vinculadas a cada portal (Mi empresa → Portales). Es un agregado: como
 * mucho una fila por portal, tipo de aviso y estado; los que no tienen ninguna no vienen.
 */
export interface PortalListingCounter {
  countLinked(): Promise<readonly PortalListingCount[]>;
}
