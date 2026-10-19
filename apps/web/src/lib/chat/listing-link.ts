import type { WebChatListingSearch } from '../../container';

import { CURRENCY_OPTIONS, listingHref, type ListingFilters } from '../properties/listing-filters';
import { OPERATION_OPTIONS, PROPERTY_TYPE_OPTIONS } from '../properties/search-params';

/**
 * El link "Ver todas las opciones en la web": el listado del sitio con la búsqueda que hizo el
 * agente. Los filtros que el listado no tiene (amenities, ambientes máximos) no se pasan, así que
 * la web puede mostrar alguna opción más. Un valor desconocido se descarta.
 */
export function chatListingHref(search: WebChatListingSearch): string {
  const filters: { -readonly [K in keyof ListingFilters]: ListingFilters[K] } = {
    sort: 'featured',
    page: 1,
  };
  const operation = OPERATION_OPTIONS.find((o) => o.value === search.operation)?.value;
  const propertyType = PROPERTY_TYPE_OPTIONS.find((o) => o.value === search.propertyType)?.value;
  const currency = CURRENCY_OPTIONS.find((o) => o.value === search.currency)?.value;
  const location = search.location?.trim().slice(0, 100);
  if (operation) filters.operation = operation;
  if (propertyType) filters.propertyType = propertyType;
  if (location) filters.location = location;
  if (currency) filters.currency = currency;
  if (isPositive(search.minPrice)) filters.minPrice = search.minPrice;
  if (isPositive(search.maxPrice)) filters.maxPrice = search.maxPrice;
  if (isPositive(search.minRooms)) filters.minRooms = search.minRooms;
  if (isPositive(search.minBedrooms)) filters.minBedrooms = search.minBedrooms;
  return listingHref(filters);
}

function isPositive(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value > 0;
}
