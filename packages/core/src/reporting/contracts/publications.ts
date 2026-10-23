// Contracts de Difusión (#114): el resumen de publicaciones y la pantalla de cada portal.

import { z } from 'zod';

import {
  LISTING_OWNER_KIND_VALUES,
  PORTAL_VALUES,
  type ListingOperationValue,
  type ListingOwnerKindValue,
  type ListingStatusValue,
  type ListingTypeValue,
  type PortalValue,
} from '../../portals/contracts';
import { pageQuerySchema } from '../../shared/contracts';

/** Los contadores de cada portal; las reglas están en `domain/publication-buckets.ts`. */
export const PUBLICATION_BUCKET_VALUES = [
  'published',
  'simple',
  'featured',
  'pending',
  'paused',
  'review',
  'error',
  'missing',
] as const;
export type PublicationBucketValue = (typeof PUBLICATION_BUCKET_VALUES)[number];

export type PublicationCountsView = Readonly<Record<PublicationBucketValue, number>>;

/** Lo disponible de un tipo y cuánto está publicado en la web. */
export interface AvailabilitySummary {
  readonly available: number;
  readonly onWeb: number;
}

export interface PortalKindOverview {
  readonly kind: ListingOwnerKindValue;
  readonly counts: PublicationCountsView;
  /** Propiedades o emprendimientos distintos con algún aviso online en el portal. */
  readonly publishedOwners: number;
}

export interface PortalPublicationOverview {
  readonly portal: PortalValue;
  /** Lo que publica la cuenta, en el orden del catálogo de portales. */
  readonly kinds: readonly PortalKindOverview[];
}

/**
 * Difusión: lo disponible (propiedades sueltas, sin las unidades de los emprendimientos, y
 * emprendimientos en comercialización) y los contadores de cada portal prendido.
 */
export interface PublicationOverview {
  readonly properties: AvailabilitySummary;
  readonly developments: AvailabilitySummary;
  readonly portals: readonly PortalPublicationOverview[];
}

export const PORTAL_PUBLICATION_SORT_FIELDS = ['updatedAt'] as const;

export const ListPortalPublicationsQuerySchema = pageQuerySchema({
  sortable: PORTAL_PUBLICATION_SORT_FIELDS,
  defaultSort: { field: 'updatedAt', direction: 'desc' },
}).extend({
  portal: z.enum(PORTAL_VALUES),
  kind: z.enum(LISTING_OWNER_KIND_VALUES),
  bucket: z.enum(PUBLICATION_BUCKET_VALUES).default('published'),
});
export type ListPortalPublicationsQuery = z.input<typeof ListPortalPublicationsQuerySchema>;

export type PublicationOwnerRef =
  | {
      readonly kind: 'property';
      readonly id: string;
      readonly code: string;
      readonly title: string;
    }
  | {
      readonly kind: 'development';
      readonly id: string;
      readonly code: string;
      readonly name: string;
    };

export interface PublicationListingRef {
  readonly id: string;
  /** Sin operación: el aviso lleva todas (Zonaprop) o es de un emprendimiento. */
  readonly operation: ListingOperationValue | undefined;
  readonly listingType: ListingTypeValue;
  readonly plan: string | undefined;
  readonly status: ListingStatusValue;
  /** El motivo del portal: por qué la rechazó, la pausó o la venció. */
  readonly lastError: string | undefined;
  readonly permalink: string | undefined;
}

/** Una fila del listado de un portal. Sin `listing`: lo disponible que no tiene aviso ahí. */
export interface PortalPublicationRow {
  readonly owner: PublicationOwnerRef;
  readonly listing: PublicationListingRef | undefined;
  /** La última actualización del aviso o, sin aviso, de la propiedad o el emprendimiento. */
  readonly updatedAt: Date;
}
