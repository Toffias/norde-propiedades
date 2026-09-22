import type { Currency, Operation, PropertyType } from '../../contracts';
import type { PropertyStatus } from '../../domain/property-status';

/** Fila de lectura de una propiedad, tal como la guarda el sistema (incluye datos internos). */
export interface PropertyRecord {
  readonly id: string;
  readonly code: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly operation: Operation;
  readonly propertyType: PropertyType;
  readonly status: PropertyStatus;
  readonly publishedOnWeb: boolean;
  readonly address: string | null;
  readonly showExactAddress: boolean;
  readonly neighborhood: string;
  readonly city: string;
  readonly priceCents: bigint | null;
  readonly currency: Currency;
  readonly expensesCents: bigint | null;
  readonly rooms: number | null;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly surfaceTotalM2: number | null;
  readonly surfaceCoveredM2: number | null;
  readonly amenities: readonly string[];
  /** URLs públicas, la primera es la portada. */
  readonly imageUrls: readonly string[];
}

export interface PropertySearchCriteria {
  readonly statuses: readonly PropertyStatus[];
  readonly publishedOnWebOnly: boolean;
  readonly operation?: Operation | undefined;
  readonly propertyType?: PropertyType | undefined;
  /** Coincide si alguna palabra aparece en barrio, localidad o dirección (sin acentos). */
  readonly location?: string | undefined;
  readonly currency?: Currency | undefined;
  readonly minPriceCents?: bigint | undefined;
  readonly maxPriceCents?: bigint | undefined;
  readonly minRooms?: number | undefined;
  readonly maxRooms?: number | undefined;
  readonly minBedrooms?: number | undefined;
  readonly minSurfaceM2?: number | undefined;
  /** Tiene que tener todas (coincidencia parcial y sin acentos). */
  readonly amenities?: readonly string[] | undefined;
  readonly offset: number;
  readonly limit: number;
}

/**
 * Puerto de lectura de propiedades (CQRS liviano): infra lo implementa con SQL optimizado.
 * Solo filtra; qué es visible al público lo decide el dominio y llega en `statuses`.
 */
export interface PropertySearchQuery {
  search(
    criteria: PropertySearchCriteria,
  ): Promise<{ readonly items: readonly PropertyRecord[]; readonly total: number }>;
  findById(id: string): Promise<PropertyRecord | undefined>;
}
