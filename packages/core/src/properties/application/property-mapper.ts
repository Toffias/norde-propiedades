import type { PropertyDetail, PropertySummary } from '../contracts';
import { publicAddress } from '../domain/property-status';

import type { PropertyRecord } from './ports/property-search-query';

export function toPropertySummary(record: PropertyRecord): PropertySummary {
  return {
    id: record.id,
    code: record.code,
    slug: record.slug,
    title: record.title,
    operation: record.operation,
    propertyType: record.propertyType,
    price:
      record.priceCents === null
        ? null
        : { amountCents: record.priceCents, currency: record.currency },
    // Las expensas se pagan siempre en pesos.
    expenses:
      record.expensesCents === null ? null : { amountCents: record.expensesCents, currency: 'ARS' },
    rooms: record.rooms,
    bedrooms: record.bedrooms,
    bathrooms: record.bathrooms,
    surfaceTotalM2: record.surfaceTotalM2,
    surfaceCoveredM2: record.surfaceCoveredM2,
    neighborhood: record.neighborhood,
    city: record.city,
    amenities: record.amenities,
    coverImageUrl: record.imageUrls[0] ?? null,
    photoCount: record.imageUrls.length,
  };
}

export function toPropertyDetail(record: PropertyRecord): PropertyDetail {
  return {
    ...toPropertySummary(record),
    description: record.description,
    address: publicAddress(record),
    imageUrls: record.imageUrls,
  };
}
