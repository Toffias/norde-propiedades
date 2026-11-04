import 'server-only';

import { getContainer } from '../../container';
import { listingHref, listingTitle, type ListingFilters } from '../properties/listing-filters';

import { ignoredFilters, subscriptionCriteria, subscriptionSummary } from './search-subscription';

/** Lo que necesita el aviso "Suscribirme a esta búsqueda" del listado (#208). */
export interface ListingSubscription {
  readonly search: string;
  readonly summary: string;
  readonly needsOperation: boolean;
  readonly ignored: readonly string[];
}

/**
 * La búsqueda del listado para suscribirse, o `undefined` si la web no tiene configurado el webhook
 * del panel (entonces no se ofrece).
 */
export function listingSubscription(
  filters: ListingFilters,
  locationNames: readonly string[],
): ListingSubscription | undefined {
  if (getContainer().subscriptions === undefined) return undefined;
  // La misma URL del listado, sin página ni vista: es la búsqueda, no dónde estaba mirando.
  const href = listingHref(filters, { page: 1, view: undefined });
  const search = href.includes('?') ? href.slice(href.indexOf('?') + 1) : '';
  const { operation } = filters;
  return {
    search,
    summary:
      operation === undefined
        ? listingTitle(filters, locationNames)
        : subscriptionSummary({ ...subscriptionCriteria(filters), operation }, locationNames),
    needsOperation: operation === undefined,
    ignored: ignoredFilters(filters),
  };
}
