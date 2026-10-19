// Listado y ficha públicos de emprendimientos: lo que ve la web de los que se están comercializando.

import { z } from 'zod';

import {
  CONSTRUCTION_STATUS_VALUES,
  DEVELOPMENT_TYPES,
  type ConstructionStatusValue,
  type DevelopmentType,
} from './developments';
import type { MoneyDto, PublicCoordinatesDto, PublicFeature, PublicImage } from './public';

/** Tope del listado público de emprendimientos. */
export const PUBLIC_DEVELOPMENTS_MAX_PAGE_SIZE = 24;

/** `newest`: los últimos que se cargaron primero. `delivery_asc`: los que se entregan antes. */
export const PUBLIC_DEVELOPMENT_SORT_VALUES = ['newest', 'delivery_asc'] as const;
export type PublicDevelopmentSort = (typeof PUBLIC_DEVELOPMENT_SORT_VALUES)[number];

export const SearchPublishedDevelopmentsInputSchema = z.object({
  developmentType: z.enum(DEVELOPMENT_TYPES).optional(),
  constructionStatus: z.enum(CONSTRUCTION_STATUS_VALUES).optional(),
  sort: z.enum(PUBLIC_DEVELOPMENT_SORT_VALUES).default('newest'),
  page: z.int().min(1).max(1000).default(1),
  pageSize: z.int().min(1).max(PUBLIC_DEVELOPMENTS_MAX_PAGE_SIZE).default(12),
});
export type SearchPublishedDevelopmentsInput = z.input<
  typeof SearchPublishedDevelopmentsInputSchema
>;

/** La ficha se busca por el slug de la URL. */
export const GetPublishedDevelopmentInputSchema = z.object({
  slug: z.string().trim().min(1).max(200),
});
export type GetPublishedDevelopmentInput = z.input<typeof GetPublishedDevelopmentInputSchema>;

/** Avisarle a la web que un emprendimiento cambió (ADR 0023). */
export const RevalidatePublicDevelopmentInputSchema = z.object({ developmentId: z.uuid() });
export type RevalidatePublicDevelopmentInput = z.input<
  typeof RevalidatePublicDevelopmentInputSchema
>;

/** Tarjeta pública de un emprendimiento. */
export interface DevelopmentSummary {
  readonly id: string;
  readonly code: string;
  readonly slug: string;
  readonly name: string;
  readonly developmentType: DevelopmentType | null;
  readonly constructionStatus: ConstructionStatusValue | null;
  /** Entrega estimada (`AAAA-MM-DD`). */
  readonly deliveryDate: string | null;
  /** La dirección aproximada que carga el equipo: la exacta es privada. */
  readonly address: string | null;
  readonly neighborhood: string;
  readonly city: string;
  /** Unidades publicadas y disponibles. */
  readonly availableUnitCount: number;
  /** El menor precio de venta visible entre sus unidades; `null`: "Consultar precio". */
  readonly priceFrom: MoneyDto | null;
  readonly cover: PublicImage | null;
  readonly photoCount: number;
}

export interface PublishedDevelopmentDetail extends DevelopmentSummary {
  readonly description: string;
  readonly province: string;
  /** Siempre aproximadas: la dirección exacta del emprendimiento es privada. */
  readonly coordinates: PublicCoordinatesDto | null;
  readonly isFinanced: boolean;
  readonly acceptsSwap: boolean;
  readonly immediateDeed: boolean;
  /** Formas de pago y financiación propia del desarrollista. */
  readonly financingDetails: string | null;
  readonly features: readonly PublicFeature[];
  readonly photos: readonly PublicImage[];
  readonly floorPlans: readonly PublicImage[];
  readonly videoUrls: readonly string[];
  readonly tourUrls: readonly string[];
  readonly updatedAt: Date;
}
