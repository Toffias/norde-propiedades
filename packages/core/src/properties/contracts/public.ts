// Búsqueda y ficha públicas: lo que ven la web y el agente de IA de una propiedad publicada.

import { z } from 'zod';

import type { FeatureKindValue, LocationKindValue } from './catalog';
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

const Latitude = z.number().min(-90).max(90);
const Longitude = z.number().min(-180).max(180);

/** Rectángulo visible del mapa ("Buscar en esta zona"). */
export const MapAreaSchema = z
  .object({ south: Latitude, west: Longitude, north: Latitude, east: Longitude })
  .refine((area) => area.south < area.north && area.west < area.east, {
    message: 'El área del mapa no es válida.',
  });
export type MapArea = z.infer<typeof MapAreaSchema>;

/**
 * Opciones de ambientes, dormitorios y baños del buscador de la web: de 1 al tope, y el tope es
 * "o más" (la regla vive en `domain/public-search.ts`).
 */
export const PUBLIC_COUNT_OPTION_LIMITS = { rooms: 4, bedrooms: 3, bathrooms: 3 } as const;
export type PublicCountFacet = keyof typeof PUBLIC_COUNT_OPTION_LIMITS;

/** Antigüedad del buscador de la web. */
export const PUBLIC_AGE_VALUES = [
  'brand_new',
  'up_to_5',
  'up_to_10',
  'up_to_20',
  'over_20',
] as const;
export type PublicAge = (typeof PUBLIC_AGE_VALUES)[number];

function countOptionsSchema(facet: PublicCountFacet) {
  const limit = PUBLIC_COUNT_OPTION_LIMITS[facet];
  return z.array(z.int().min(1).max(limit)).min(1).max(limit).optional();
}

/** Tope de ubicaciones elegidas a la vez en el buscador de la web. */
export const MAX_PUBLIC_LOCATIONS = 10;

export const SearchPropertiesInputSchema = z.object({
  operation: z.enum(OPERATIONS).optional(),
  propertyType: z.enum(PROPERTY_TYPES).optional(),
  /** Tipos de la web: alguno de ellos. */
  propertyTypes: z.array(z.enum(PROPERTY_TYPES)).min(1).max(PROPERTY_TYPES.length).optional(),
  /** Barrio, localidad o zona en texto libre (agente). */
  location: z.string().trim().min(1).max(100).optional(),
  /** Ubicaciones del catálogo (web): alguna de ellas, con sus barrios y sub-barrios. */
  locationIds: z.array(z.uuid()).min(1).max(MAX_PUBLIC_LOCATIONS).optional(),
  /** Solo las que caen en esta área del mapa (con su ubicación pública, no la exacta). */
  area: MapAreaSchema.optional(),
  /**
   * Moneda del filtro de precio. Con la cotización de la empresa, también entran las publicadas
   * en la otra moneda cuyo precio convertido cae en el rango.
   */
  currency: z.enum(CURRENCIES).optional(),
  minPriceCents: z.bigint().nonnegative().optional(),
  maxPriceCents: z.bigint().nonnegative().optional(),
  minRooms: z.int().min(0).max(50).optional(),
  maxRooms: z.int().min(0).max(50).optional(),
  minBedrooms: z.int().min(0).max(50).optional(),
  minBathrooms: z.int().min(0).max(50).optional(),
  /** Opciones de la web (`PUBLIC_COUNT_OPTION_LIMITS`): alguna de ellas; la última es "o más". */
  rooms: countOptionsSchema('rooms'),
  bedrooms: countOptionsSchema('bedrooms'),
  bathrooms: countOptionsSchema('bathrooms'),
  /** Superficie total (o cubierta, si no tiene total). */
  minSurfaceM2: z.number().positive().max(1_000_000).optional(),
  maxSurfaceM2: z.number().positive().max(1_000_000).optional(),
  age: z.enum(PUBLIC_AGE_VALUES).optional(),
  furnished: z.literal(true).optional(),
  /** Con al menos una cochera. */
  withParking: z.literal(true).optional(),
  /** Servicios, ambientes o amenities en texto libre (agente): tiene que tener todos. */
  amenities: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  /** Características del catálogo (web): tiene que tener todas. */
  featureIds: z.array(z.uuid()).max(10).optional(),
  creditEligible: z.boolean().optional(),
  featuredOnly: z.boolean().optional(),
  /** Para "propiedades similares": deja afuera la ficha que se está viendo. */
  excludePropertyId: z.uuid().optional(),
  /** Las unidades de un emprendimiento (su ficha en la web). */
  developmentId: z.uuid().optional(),
  sort: z.enum(PUBLIC_SORT_VALUES).default('featured'),
  page: z.int().min(1).max(1000).default(1),
  pageSize: z.int().min(1).max(PUBLIC_SEARCH_MAX_PAGE_SIZE).default(3),
});

export type SearchPropertiesInput = z.input<typeof SearchPropertiesInputSchema>;

/** Pines por pedido del mapa público: la cartera entera de Norde entra holgada. */
export const MAX_PUBLIC_MAP_PINS = 300;

/** Los pines del mapa del listado: los mismos filtros que la búsqueda, sin orden ni páginas. */
export const GetPublicPropertyMapInputSchema = SearchPropertiesInputSchema.pick({
  operation: true,
  propertyType: true,
  propertyTypes: true,
  location: true,
  locationIds: true,
  area: true,
  currency: true,
  minPriceCents: true,
  maxPriceCents: true,
  minRooms: true,
  minBedrooms: true,
  rooms: true,
  bedrooms: true,
  bathrooms: true,
  minSurfaceM2: true,
  maxSurfaceM2: true,
  age: true,
  furnished: true,
  withParking: true,
  featureIds: true,
});
export type GetPublicPropertyMapInput = z.input<typeof GetPublicPropertyMapInputSchema>;

/** Las opciones del buscador de la web con cuántas propiedades daría cada una. */
export const GetPublicSearchFacetsInputSchema = GetPublicPropertyMapInputSchema;
export type GetPublicSearchFacetsInput = GetPublicPropertyMapInput;

/** Características del catálogo que se ofrecen como filtro (las más frecuentes). */
export const PUBLIC_FEATURE_FACET_LIMIT = 12;

export interface PublicCountOption {
  /** La opción (1, 2, …); la última es "o más". */
  readonly value: number;
  readonly count: number;
}

export interface PublicTypeOption {
  readonly value: PropertyType;
  readonly count: number;
}

export interface PublicFeatureOption {
  readonly id: string;
  readonly name: string;
  readonly count: number;
}

/**
 * Cuántas propiedades daría cada opción con los demás filtros puestos. En ambientes, dormitorios
 * y baños, y en el tipo, el propio filtro no cuenta (se elige más de una); en características y en "amoblado" o
 * "con cochera", sí (se suman).
 */
export interface PublicSearchFacets {
  /** Los tipos con alguna propiedad, contados sin el filtro de tipo, de más a menos. */
  readonly propertyTypes: readonly PublicTypeOption[];
  readonly rooms: readonly PublicCountOption[];
  readonly bedrooms: readonly PublicCountOption[];
  readonly bathrooms: readonly PublicCountOption[];
  /** Las más frecuentes y las elegidas. */
  readonly features: readonly PublicFeatureOption[];
  readonly furnished: number;
  readonly withParking: number;
}

/** Tope del buscador de ubicaciones de la web. */
export const PUBLIC_LOCATIONS_MAX_PAGE_SIZE = 20;

/**
 * Ubicaciones del catálogo con propiedades publicadas: el buscador (`q`; sin texto, los barrios y
 * localidades con más propiedades) o las elegidas, para mostrar su nombre (`ids`).
 */
export const SearchPublicLocationsInputSchema = z.object({
  /** Nombre, sin distinguir mayúsculas ni acentos. */
  q: z.string().trim().min(2).max(80).optional(),
  ids: z.array(z.uuid()).min(1).max(MAX_PUBLIC_LOCATIONS).optional(),
  /** Cuenta solo las propiedades que ofrecen esta operación. */
  operation: z.enum(OPERATIONS).optional(),
  page: z.int().min(1).max(100).default(1),
  pageSize: z.int().min(1).max(PUBLIC_LOCATIONS_MAX_PAGE_SIZE).default(8),
});
export type SearchPublicLocationsInput = z.input<typeof SearchPublicLocationsInputSchema>;

export interface PublicLocation {
  readonly id: string;
  readonly kind: LocationKindValue;
  readonly name: string;
  /** Dónde queda, para distinguir homónimos: "CABA", "La Matanza, Buenos Aires". */
  readonly context: string;
  /** Propiedades publicadas en la ubicación y sus barrios. */
  readonly listingCount: number;
}

/** La ficha se busca por id (agente), por slug (URL de la web) o por el código que muestra la web. */
export const GetPropertyDetailInputSchema = z.union([
  z.object({ propertyId: z.string() }),
  z.object({ slug: z.string().trim().min(1).max(200) }),
  z.object({ code: z.string().trim().min(1).max(40) }),
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

/** Un pin del mapa del listado, con lo que muestra su tarjeta. */
export interface PublicMapPin {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly propertyType: PropertyType;
  readonly operation: Operation;
  /** `null`: "Consultar precio". */
  readonly price: MoneyDto | null;
  readonly coordinates: PublicCoordinatesDto;
  readonly cover: PublicImage | null;
  readonly rooms: number | null;
  readonly surfaceTotalM2: number | null;
  readonly surfaceCoveredM2: number | null;
  readonly neighborhood: string;
  readonly city: string;
}

export interface PublicMapResult {
  readonly pins: readonly PublicMapPin[];
  /** Cuántas propiedades con ubicación en el mapa cumplen los filtros. */
  readonly total: number;
  /** Hay más de `MAX_PUBLIC_MAP_PINS`: se muestran las primeras (destacadas y más nuevas). */
  readonly truncated: boolean;
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
