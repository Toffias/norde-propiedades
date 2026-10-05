import type { Currency, Operation, PropertyType, PublicSort } from '../../contracts';
import type { FeatureKind } from '../../domain/feature';
import type { MediaKind, MediaProcessingStatus, MediaVariants } from '../../domain/media-item';
import type { PropertyStatus } from '../../domain/property-status';

export interface PropertyOperationRecord {
  readonly operation: Operation;
  readonly priceCents: bigint | null;
  readonly currency: Currency;
  readonly priceOnRequest: boolean;
}

/** Foto, plano, video o recorrido, con lo necesario para decidir si se publica. */
export interface PropertyMediaRecord {
  readonly id: string;
  readonly kind: MediaKind;
  readonly storageKey: string | null;
  /** Link de videos y recorridos, o de fotos importadas sin archivo propio. */
  readonly externalUrl: string | null;
  readonly showOnWeb: boolean;
  readonly processing: MediaProcessingStatus;
  readonly variants: MediaVariants;
  readonly width: number | null;
  readonly height: number | null;
  readonly description: string | null;
  readonly updatedAt: Date;
}

/**
 * Fila de lectura de una propiedad, tal como la guarda el sistema (incluye datos internos). Qué
 * se publica lo decide el dominio (`public-listing.ts`).
 */
export interface PropertyRecord {
  readonly id: string;
  readonly code: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly propertyType: PropertyType;
  readonly status: PropertyStatus;
  readonly publishedOnWeb: boolean;
  readonly featured: boolean;
  readonly showPriceOnWeb: boolean;
  /** En el orden del catálogo (venta, alquiler, temporario). */
  readonly operations: readonly PropertyOperationRecord[];
  /** Calle y altura. */
  readonly address: string | null;
  readonly showExactAddress: boolean;
  readonly publishAddress: string | null;
  readonly neighborhood: string;
  readonly city: string;
  readonly province: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly expensesCents: bigint | null;
  readonly rooms: number | null;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly toilets: number | null;
  readonly parkingSpaces: number | null;
  readonly ageYears: number | null;
  readonly condition: string | null;
  readonly disposition: string | null;
  readonly orientation: string | null;
  readonly surfaceTotalM2: number | null;
  readonly surfaceCoveredM2: number | null;
  readonly surfaceSemiCoveredM2: number | null;
  readonly surfaceLandM2: number | null;
  readonly frontM: number | null;
  readonly depthM: number | null;
  readonly isFurnished: boolean;
  readonly creditEligible: boolean;
  readonly professionalUse: boolean;
  readonly developmentId: string | null;
  /** Características activas del catálogo, en su orden. */
  readonly features: readonly { readonly kind: FeatureKind; readonly name: string }[];
  /** En el orden de la galería; la portada primero. */
  readonly media: readonly PropertyMediaRecord[];
  readonly updatedAt: Date;
}

export interface PropertySearchCriteria {
  readonly statuses: readonly PropertyStatus[];
  readonly publishedOnWebOnly: boolean;
  readonly operation?: Operation | undefined;
  readonly propertyType?: PropertyType | undefined;
  /** Coincide si alguna palabra aparece en barrio, localidad o dirección (sin acentos). */
  readonly location?: string | undefined;
  /** La ubicación o cualquiera de sus descendientes. */
  readonly locationId?: string | undefined;
  /**
   * Filtro de precio sobre la operación buscada (o cualquiera) en esta moneda. Las que no
   * muestran el precio en la web quedan afuera: el filtro no puede revelarlo.
   */
  readonly currency?: Currency | undefined;
  readonly minPriceCents?: bigint | undefined;
  readonly maxPriceCents?: bigint | undefined;
  readonly minRooms?: number | undefined;
  readonly maxRooms?: number | undefined;
  readonly minBedrooms?: number | undefined;
  readonly minBathrooms?: number | undefined;
  readonly minSurfaceM2?: number | undefined;
  /** Tiene que tener todas (coincidencia parcial y sin acentos con el nombre). */
  readonly amenities?: readonly string[] | undefined;
  /** Tiene que tener todas. */
  readonly featureIds?: readonly string[] | undefined;
  readonly creditEligible?: boolean | undefined;
  readonly featuredOnly?: boolean | undefined;
  readonly excludePropertyId?: string | undefined;
  readonly sort: PublicSort;
  readonly offset: number;
  readonly limit: number;
}

/**
 * Puerto de lectura de propiedades (CQRS liviano): infra lo implementa con SQL optimizado.
 * Solo filtra; qué es visible al público lo decide el dominio y llega en `statuses`. Una
 * propiedad sin operaciones no se ofrece: no hay nada que mostrar en la tarjeta.
 */
export interface PropertySearchQuery {
  search(
    criteria: PropertySearchCriteria,
  ): Promise<{ readonly items: readonly PropertyRecord[]; readonly total: number }>;
  findById(id: string): Promise<PropertyRecord | undefined>;
  findBySlug(slug: string): Promise<PropertyRecord | undefined>;
}
