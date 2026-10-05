// Búsqueda y ficha públicas: lo que ven la web y el agente de IA de una propiedad publicada.

import { z } from 'zod';

import type { FeatureKindValue } from './catalog';
import {
  CURRENCIES,
  OPERATIONS,
  PROPERTY_TYPES,
  type Currency,
  type Operation,
  type PropertyType,
} from './values';

/** Tope de la búsqueda pública (web y agente). El panel usa el `MAX_PAGE_SIZE` de shared. */
export const PUBLIC_SEARCH_MAX_PAGE_SIZE = 24;

/**
 * Órdenes de la búsqueda pública. `featured`: destacadas primero, después las más nuevas. El
 * orden por precio usa el de la operación buscada (o la principal) y agrupa por moneda.
 */
export const PUBLIC_SORT_VALUES = [
  'featured',
  'newest',
  'price_asc',
  'price_desc',
  'surface_desc',
] as const;
export type PublicSort = (typeof PUBLIC_SORT_VALUES)[number];

export const SearchPropertiesInputSchema = z.object({
  operation: z.enum(OPERATIONS).optional(),
  propertyType: z.enum(PROPERTY_TYPES).optional(),
  /** Barrio, localidad o zona en texto libre (agente). */
  location: z.string().trim().min(1).max(100).optional(),
  /** Ubicación del catálogo (web): incluye sus barrios y sub-barrios. */
  locationId: z.uuid().optional(),
  /** Moneda del filtro de precio. */
  currency: z.enum(CURRENCIES).optional(),
  minPriceCents: z.bigint().nonnegative().optional(),
  maxPriceCents: z.bigint().nonnegative().optional(),
  minRooms: z.int().min(0).max(50).optional(),
  maxRooms: z.int().min(0).max(50).optional(),
  minBedrooms: z.int().min(0).max(50).optional(),
  minBathrooms: z.int().min(0).max(50).optional(),
  minSurfaceM2: z.number().positive().max(1_000_000).optional(),
  /** Servicios, ambientes o amenities en texto libre (agente): tiene que tener todos. */
  amenities: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  /** Características del catálogo (web): tiene que tener todas. */
  featureIds: z.array(z.uuid()).max(10).optional(),
  creditEligible: z.boolean().optional(),
  featuredOnly: z.boolean().optional(),
  /** Para "propiedades similares": deja afuera la ficha que se está viendo. */
  excludePropertyId: z.uuid().optional(),
  sort: z.enum(PUBLIC_SORT_VALUES).default('featured'),
  page: z.int().min(1).max(1000).default(1),
  pageSize: z.int().min(1).max(PUBLIC_SEARCH_MAX_PAGE_SIZE).default(3),
});

export type SearchPropertiesInput = z.input<typeof SearchPropertiesInputSchema>;

/** La ficha se busca por id (agente) o por slug (URL de la web). */
export const GetPropertyDetailInputSchema = z.union([
  z.object({ propertyId: z.string() }),
  z.object({ slug: z.string().trim().min(1).max(200) }),
]);
export type GetPropertyDetailInput = z.input<typeof GetPropertyDetailInputSchema>;

export interface MoneyDto {
  readonly amountCents: bigint;
  readonly currency: Currency;
}

export interface PublicOperation {
  readonly operation: Operation;
  /** `null`: "Consultar precio". */
  readonly price: MoneyDto | null;
}

/**
 * Una foto o un plano publicado. `src` es una ruta del sitio (`/fotos/<id>/<versión>`) o, en
 * las fotos importadas sin archivo propio, un link `https://`.
 */
export interface PublicImage {
  readonly id: string;
  readonly src: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly description: string | null;
}

/** Ruta pública de una foto. La versión cambia si la foto cambia, así se cachea para siempre. */
export function publicImagePath(mediaId: string, version: string): string {
  return `/fotos/${mediaId}/${version}`;
}

/** La versión de una foto: su última modificación. Una foto rotada cambia de URL. */
export function publicImageVersion(updatedAt: Date): string {
  return updatedAt.getTime().toString(36);
}

/** `/fotos/<id>/<versión>`: la versión no elige el archivo, solo detecta una URL vieja. */
export const GetPublicPhotoInputSchema = z.object({
  mediaId: z.uuid(),
  version: z.string().regex(/^[0-9a-z]{1,16}$/),
});
export type GetPublicPhotoInput = z.input<typeof GetPublicPhotoInputSchema>;

/**
 * Lo que entrega la ruta pública de fotos: el archivo (se cachea para siempre), el link de una
 * foto importada sin archivo propio, o la ruta nueva si la versión pedida quedó vieja.
 */
export type PublicPhotoDelivery =
  | { readonly kind: 'content'; readonly contentType: string; readonly bytes: Uint8Array }
  | { readonly kind: 'external'; readonly url: string }
  | { readonly kind: 'moved'; readonly path: string };

/** Avisarle a la web que una propiedad cambió (ADR 0023). */
export const RevalidatePublicPropertyInputSchema = z.object({ propertyId: z.uuid() });
export type RevalidatePublicPropertyInput = z.input<typeof RevalidatePublicPropertyInputSchema>;

export interface PublicFeature {
  readonly kind: FeatureKindValue;
  readonly name: string;
}

export interface PropertySummary {
  readonly id: string;
  readonly code: string;
  readonly slug: string;
  readonly title: string;
  /** La operación buscada, o la principal (venta, alquiler, temporario). */
  readonly operation: Operation;
  /** Precio de `operation`. `null`: "Consultar precio". */
  readonly price: MoneyDto | null;
  /** Todas las operaciones que ofrece, en el orden del catálogo. */
  readonly operations: readonly PublicOperation[];
  readonly propertyType: PropertyType;
  readonly featured: boolean;
  readonly expenses: MoneyDto | null;
  readonly rooms: number | null;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly parkingSpaces: number | null;
  readonly surfaceTotalM2: number | null;
  readonly surfaceCoveredM2: number | null;
  /** Exacta o aproximada según la propiedad; `null` si no se publica ninguna. */
  readonly address: string | null;
  readonly neighborhood: string;
  readonly city: string;
  /** Nombres de los amenities (los servicios y ambientes van en la ficha). */
  readonly amenities: readonly string[];
  readonly cover: PublicImage | null;
  readonly photoCount: number;
}

export interface PublicCoordinatesDto {
  readonly latitude: number;
  readonly longitude: number;
  /** `false`: aproximadas a la manzana; el mapa muestra una zona. */
  readonly exact: boolean;
}

export interface PropertyDetail extends PropertySummary {
  readonly description: string;
  readonly province: string;
  readonly coordinates: PublicCoordinatesDto | null;
  readonly toilets: number | null;
  readonly ageYears: number | null;
  readonly condition: string | null;
  readonly disposition: string | null;
  readonly orientation: string | null;
  readonly surfaceSemiCoveredM2: number | null;
  readonly surfaceLandM2: number | null;
  readonly frontM: number | null;
  readonly depthM: number | null;
  readonly isFurnished: boolean;
  readonly creditEligible: boolean;
  readonly professionalUse: boolean;
  readonly features: readonly PublicFeature[];
  readonly photos: readonly PublicImage[];
  readonly floorPlans: readonly PublicImage[];
  readonly videoUrls: readonly string[];
  readonly tourUrls: readonly string[];
  /** Unidad de un emprendimiento. */
  readonly developmentId: string | null;
  readonly updatedAt: Date;
}
