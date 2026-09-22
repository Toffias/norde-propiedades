// Contracts del módulo properties (`@norde/core/properties/contracts`): importables desde el cliente.

import { z } from 'zod';

export const OPERATIONS = ['sale', 'rent', 'temporary_rent'] as const;
export type Operation = (typeof OPERATIONS)[number];

export const PROPERTY_TYPES = [
  'apartment',
  'house',
  'ph',
  'land',
  'office',
  'commercial',
  'garage',
  'warehouse',
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const CURRENCIES = ['ARS', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const MAX_PAGE_SIZE = 10;

export const SearchPropertiesInputSchema = z.object({
  operation: z.enum(OPERATIONS).optional(),
  propertyType: z.enum(PROPERTY_TYPES).optional(),
  /** Barrio, localidad o zona en texto libre. */
  location: z.string().trim().min(1).max(100).optional(),
  currency: z.enum(CURRENCIES).optional(),
  minPriceCents: z.bigint().nonnegative().optional(),
  maxPriceCents: z.bigint().nonnegative().optional(),
  minRooms: z.int().min(0).max(50).optional(),
  maxRooms: z.int().min(0).max(50).optional(),
  minBedrooms: z.int().min(0).max(50).optional(),
  minSurfaceM2: z.number().positive().max(1_000_000).optional(),
  amenities: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  page: z.int().min(1).max(1000).default(1),
  pageSize: z.int().min(1).max(MAX_PAGE_SIZE).default(3),
});

export type SearchPropertiesInput = z.input<typeof SearchPropertiesInputSchema>;

export interface MoneyDto {
  readonly amountCents: bigint;
  readonly currency: Currency;
}

export interface PropertySummary {
  readonly id: string;
  readonly code: string;
  readonly slug: string;
  readonly title: string;
  readonly operation: Operation;
  readonly propertyType: PropertyType;
  /** `null`: "precio a consultar". */
  readonly price: MoneyDto | null;
  readonly expenses: MoneyDto | null;
  readonly rooms: number | null;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly surfaceTotalM2: number | null;
  readonly surfaceCoveredM2: number | null;
  readonly neighborhood: string;
  readonly city: string;
  readonly amenities: readonly string[];
  readonly coverImageUrl: string | null;
  readonly photoCount: number;
}

export interface PropertyDetail extends PropertySummary {
  readonly description: string;
  /** `null` si la propiedad no muestra la dirección exacta. */
  readonly address: string | null;
  readonly imageUrls: readonly string[];
}
