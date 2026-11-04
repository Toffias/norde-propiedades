import type { Currency, Operation, PropertyType } from '@norde/core/properties/contracts';

import { listingTitle, priceCurrency, type ListingFilters } from '../properties/listing-filters';

// La suscripción a una búsqueda desde el listado (#208): qué filtros del buscador se guardan en la
// búsqueda del contacto y cómo se titula. La búsqueda del panel cruza operación, tipos, ubicaciones
// del catálogo, precio y ambientes mínimos: el resto de los filtros no se tiene en cuenta.

export const SUBSCRIPTION_FREQUENCIES = ['every_3_days', 'weekly', 'monthly'] as const;
export type SubscriptionFrequency = (typeof SUBSCRIPTION_FREQUENCIES)[number];

export const FREQUENCY_LABELS: Readonly<Record<SubscriptionFrequency, string>> = {
  every_3_days: 'Cada 3 días',
  weekly: 'Una vez por semana',
  monthly: 'Una vez por mes',
};

/** Lo que se guarda de la búsqueda. Sin operación, la persona la elige en el formulario. */
export interface SubscriptionCriteria {
  readonly operation: Operation | undefined;
  readonly propertyTypes: readonly PropertyType[];
  readonly locationIds: readonly string[];
  readonly currency: Currency | undefined;
  /** En unidades, como los escribió la persona. */
  readonly minPrice: number | undefined;
  readonly maxPrice: number | undefined;
  readonly minRooms: number | undefined;
}

export function subscriptionCriteria(filters: ListingFilters): SubscriptionCriteria {
  const hasPrice = filters.minPrice !== undefined || filters.maxPrice !== undefined;
  return {
    operation: filters.operation,
    propertyTypes: filters.propertyTypes ?? [],
    locationIds: filters.locationIds ?? [],
    // Sin moneda elegida, la del buscador: la habitual de la operación.
    currency: hasPrice ? priceCurrency(filters) : undefined,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    // Varias opciones ("2 o 3 ambientes"): la búsqueda guarda el mínimo.
    minRooms: filters.rooms && filters.rooms.length > 0 ? Math.min(...filters.rooms) : undefined,
  };
}

/** Los filtros aplicados que la suscripción no puede guardar, para avisarlo. */
export function ignoredFilters(filters: ListingFilters): string[] {
  return [
    filters.location !== undefined && 'la zona escrita a mano',
    filters.area !== undefined && 'el área del mapa',
    (filters.bedrooms?.length ?? 0) > 0 && 'dormitorios',
    (filters.bathrooms?.length ?? 0) > 0 && 'baños',
    (filters.minArea !== undefined || filters.maxArea !== undefined) && 'superficie',
    filters.age !== undefined && 'antigüedad',
    filters.furnished === true && 'amoblado',
    filters.parking === true && 'cochera',
    (filters.featureIds?.length ?? 0) > 0 && 'características',
  ].filter((item): item is string => typeof item === 'string');
}

const units = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

function money(currency: Currency, amount: number): string {
  return currency === 'USD' ? `USD ${units.format(amount)}` : `$ ${units.format(amount)}`;
}

/**
 * Cómo se titula la búsqueda en el email y para el asesor: "Departamentos en venta en Palermo,
 * hasta USD 150.000, desde 2 ambientes". Con la operación que eligió la persona si el buscador
 * no tenía.
 */
export function subscriptionSummary(
  criteria: SubscriptionCriteria & { readonly operation: Operation },
  locationNames: readonly string[],
): string {
  const title = listingTitle(
    {
      operation: criteria.operation,
      propertyTypes: criteria.propertyTypes,
      locationIds: criteria.locationIds,
      sort: 'featured',
      page: 1,
    },
    locationNames,
  );
  const { currency, minPrice, maxPrice, minRooms } = criteria;
  const price =
    currency === undefined
      ? undefined
      : minPrice !== undefined && maxPrice !== undefined
        ? `de ${money(currency, minPrice)} a ${money(currency, maxPrice)}`
        : minPrice !== undefined
          ? `desde ${money(currency, minPrice)}`
          : maxPrice !== undefined
            ? `hasta ${money(currency, maxPrice)}`
            : undefined;
  const rooms =
    minRooms === undefined
      ? undefined
      : minRooms === 1
        ? 'desde 1 ambiente'
        : `desde ${minRooms.toString()} ambientes`;
  return [title, price, rooms].filter(Boolean).join(', ');
}
