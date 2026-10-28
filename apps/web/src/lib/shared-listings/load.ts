import 'server-only';

import { getContainer } from '../../container';
import { toListingCard, type ListingCard } from '../properties/view';

export type ListingReaction = 'liked' | 'disliked';

export interface SharedListingEntry {
  readonly propertyId: string;
  /** `null` si la propiedad ya no se ofrece en el sitio (vendida, reservada, despublicada). */
  readonly card: ListingCard | null;
  readonly reaction: ListingReaction | null;
}

export type SharedListingView =
  | {
      readonly kind: 'available';
      readonly advisorName: string | null;
      readonly expiresAt: Date;
      readonly entries: readonly SharedListingEntry[];
    }
  | { readonly kind: 'unavailable'; readonly reason: 'expired' | 'revoked' }
  | { readonly kind: 'not_found' };

/**
 * Lo que muestra la página de un envío. Sin caché: el link es privado y la reacción del cliente
 * tiene que verse al volver. No registra la apertura (eso lo hace el navegador).
 */
export async function loadSharedListing(token: string): Promise<SharedListingView> {
  const { sharedListings, properties } = getContainer();
  const result = await sharedListings.get({ token });
  if (result.isErr()) {
    switch (result.error.type) {
      case 'SharedListingNotFound':
        return { kind: 'not_found' };
      case 'SharedListingUnavailable':
        return { kind: 'unavailable', reason: result.error.reason };
      case 'Forbidden':
        throw new Error('The web actor cannot read shared listings');
    }
  }
  const { advisorName, expiresAt, items } = result.value;
  const entries = await Promise.all(
    items.map(async (item): Promise<SharedListingEntry> => {
      const detail = await properties.detail({ propertyId: item.propertyId });
      return {
        propertyId: item.propertyId,
        card: detail.isOk() ? toListingCard(detail.value) : null,
        reaction: item.reaction ?? null,
      };
    }),
  );
  return { kind: 'available', advisorName: advisorName ?? null, expiresAt, entries };
}
