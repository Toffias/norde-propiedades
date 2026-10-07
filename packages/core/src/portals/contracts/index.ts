// Contracts del módulo portals (`@norde/core/portals/contracts`): importables desde el cliente.
// Los valores de los enums replican los del dominio (un test verifica que coincidan).

import { z } from 'zod';

export const PORTAL_VALUES = ['mercadolibre', 'mercadolibre_developments'] as const;
export const LISTING_OWNER_KIND_VALUES = ['property', 'development'] as const;

export type PortalValue = (typeof PORTAL_VALUES)[number];
export type ListingOwnerKindValue = (typeof LISTING_OWNER_KIND_VALUES)[number];

export const PortalSchema = z.enum(PORTAL_VALUES);

export const StartPortalConnectionInputSchema = z.object({ portal: PortalSchema });
export type StartPortalConnectionInput = z.input<typeof StartPortalConnectionInputSchema>;

/**
 * La vuelta del portal después de autorizar: el `code` y el `state` que trae la URL, y el `state`
 * y el verificador PKCE que el panel guardó al empezar.
 */
export const ConnectPortalAccountInputSchema = z.object({
  portal: PortalSchema,
  code: z.string().trim().min(1).max(512),
  state: z.string().trim().min(1).max(256),
  expectedState: z.string().trim().min(1).max(256),
  codeVerifier: z.string().trim().min(43).max(128),
});
export type ConnectPortalAccountInput = z.input<typeof ConnectPortalAccountInputSchema>;

export const PortalInputSchema = z.object({ portal: PortalSchema });
export type PortalInput = z.input<typeof PortalInputSchema>;

export const SetPortalAccountEnabledInputSchema = z.object({
  portal: PortalSchema,
  enabled: z.boolean(),
});
export type SetPortalAccountEnabledInput = z.input<typeof SetPortalAccountEnabledInputSchema>;

/** Una cuenta de portal para Mi empresa → Portales. */
export interface PortalAccountView {
  readonly portal: PortalValue;
  readonly publishes: ListingOwnerKindValue;
  readonly paid: boolean;
  readonly isEnabled: boolean;
  readonly isConnected: boolean;
  readonly accountName: string | undefined;
  readonly connectedAt: Date | undefined;
}

/** Lo que devuelve la lista de cuentas: el catálogo es fijo y chico, sin paginar. */
export interface PortalAccountsView {
  readonly accounts: readonly PortalAccountView[];
  /** Si quien mira puede conectar, desconectar y activar. */
  readonly canManage: boolean;
}

// ---------- Publicaciones ----------

export const LISTING_STATUS_VALUES = [
  'pending',
  'published',
  'paused',
  'error',
  'unpublished',
] as const;
export const LISTING_INTENT_VALUES = ['active', 'paused', 'closed'] as const;
export const LISTING_TYPE_VALUES = ['simple', 'featured'] as const;
export const LISTING_OPERATION_VALUES = ['sale', 'rent', 'temporary_rent'] as const;

export type ListingStatusValue = (typeof LISTING_STATUS_VALUES)[number];
export type ListingIntentValue = (typeof LISTING_INTENT_VALUES)[number];
export type ListingTypeValue = (typeof LISTING_TYPE_VALUES)[number];
export type ListingOperationValue = (typeof LISTING_OPERATION_VALUES)[number];

/** Publicar una operación de una propiedad en un portal (o volver a publicarla). */
export const RequestPublicationInputSchema = z.object({
  propertyId: z.uuid(),
  portal: PortalSchema.default('mercadolibre'),
  operation: z.enum(LISTING_OPERATION_VALUES),
  listingType: z.enum(LISTING_TYPE_VALUES).default('simple'),
});
export type RequestPublicationInput = z.input<typeof RequestPublicationInputSchema>;

export const ListingIdInputSchema = z.object({ listingId: z.uuid() });
export type ListingIdInput = z.input<typeof ListingIdInputSchema>;

export const ChangeListingTypeInputSchema = z.object({
  listingId: z.uuid(),
  listingType: z.enum(LISTING_TYPE_VALUES),
});
export type ChangeListingTypeInput = z.input<typeof ChangeListingTypeInputSchema>;

export const PropertyListingsInputSchema = z.object({ propertyId: z.uuid() });
export type PropertyListingsInput = z.input<typeof PropertyListingsInputSchema>;

/** Una publicación en la pestaña Difusión de la ficha. */
export interface PropertyListingView {
  readonly id: string;
  readonly portal: PortalValue;
  readonly operation: ListingOperationValue;
  readonly listingType: ListingTypeValue;
  readonly status: ListingStatusValue;
  readonly intent: ListingIntentValue;
  readonly externalId: string | undefined;
  readonly permalink: string | undefined;
  readonly lastError: string | undefined;
  readonly lastSyncedAt: Date | undefined;
  readonly publishedAt: Date | undefined;
}

/** La pestaña Difusión: las publicaciones y los portales donde se puede publicar esta propiedad. */
export interface PropertyListingsView {
  readonly listings: readonly PropertyListingView[];
  /** Cuentas activas que publican propiedades sueltas. */
  readonly portals: readonly PortalValue[];
  readonly canPublish: boolean;
}
