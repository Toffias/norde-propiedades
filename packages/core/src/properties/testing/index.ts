// Fakes del módulo properties para tests (`@norde/core/properties/testing`).

import type {
  PropertyRecord,
  PropertySearchCriteria,
  PropertySearchQuery,
} from '../application/ports/property-search-query';

let sequence = 0;

/** Propiedad publicada y disponible, con valores razonables; se pisan los campos que importan. */
export function aPropertyRecord(overrides: Partial<PropertyRecord> = {}): PropertyRecord {
  sequence += 1;
  const suffix = sequence.toString().padStart(12, '0');
  return {
    id: `00000000-0000-7000-8000-${suffix}`,
    code: `P-${sequence.toString().padStart(3, '0')}`,
    slug: `propiedad-${sequence}`,
    title: `Propiedad ${sequence}`,
    description: 'Descripción de prueba',
    operation: 'rent',
    propertyType: 'apartment',
    status: 'available',
    publishedOnWeb: true,
    address: 'Gurruchaga 1800',
    showExactAddress: false,
    neighborhood: 'Palermo',
    city: 'CABA',
    priceCents: 55_000_000n,
    currency: 'ARS',
    expensesCents: null,
    rooms: 2,
    bedrooms: 1,
    bathrooms: 1,
    surfaceTotalM2: 48,
    surfaceCoveredM2: 44,
    amenities: [],
    imageUrls: ['https://example.com/1.jpg'],
    ...overrides,
  };
}

/** Implementación simple en memoria: suficiente para probar casos de uso, no la búsqueda SQL. */
export class InMemoryPropertySearchQuery implements PropertySearchQuery {
  readonly criteria: PropertySearchCriteria[] = [];

  constructor(readonly records: PropertyRecord[] = []) {}

  search(criteria: PropertySearchCriteria) {
    this.criteria.push(criteria);
    const matches = this.records.filter(
      (r) =>
        criteria.statuses.includes(r.status) &&
        (!criteria.publishedOnWebOnly || r.publishedOnWeb) &&
        (criteria.operation === undefined || r.operation === criteria.operation) &&
        (criteria.propertyType === undefined || r.propertyType === criteria.propertyType) &&
        (criteria.location === undefined ||
          `${r.neighborhood} ${r.city}`.toLowerCase().includes(criteria.location.toLowerCase())),
    );
    return Promise.resolve({
      items: matches.slice(criteria.offset, criteria.offset + criteria.limit),
      total: matches.length,
    });
  }

  findById(id: string) {
    return Promise.resolve(this.records.find((r) => r.id === id));
  }
}
