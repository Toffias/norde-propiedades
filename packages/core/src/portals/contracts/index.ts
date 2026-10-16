// Contracts del módulo portals (`@norde/core/portals/contracts`): importables desde el cliente.
// Los valores de los enums replican los del dominio (un test verifica que coincidan).

import { z } from 'zod';

export const PORTAL_VALUES = ['mercadolibre', 'mercadolibre_developments', 'zonaprop'] as const;
export const LISTING_OWNER_KIND_VALUES = ['property', 'development'] as const;
export const PORTAL_CONNECTION_METHOD_VALUES = ['oauth', 'account_code'] as const;

export type PortalValue = (typeof PORTAL_VALUES)[number];
export type ListingOwnerKindValue = (typeof LISTING_OWNER_KIND_VALUES)[number];
export type PortalConnectionMethodValue = (typeof PORTAL_CONNECTION_METHOD_VALUES)[number];

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

/** Conectar una cuenta por su código (en Zonaprop, el código de inmobiliaria). */
export const ConnectPortalAccountWithCodeInputSchema = z.object({
  portal: PortalSchema,
  accountCode: z
    .string()
    .trim()
    .min(1, 'Ingresá el código de la cuenta.')
    .max(64, 'El código no puede superar los 64 caracteres.'),
});
export type ConnectPortalAccountWithCodeInput = z.input<
  typeof ConnectPortalAccountWithCodeInputSchema
>;

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
  readonly connection: PortalConnectionMethodValue;
  /** Vacío: la cuenta todavía no publica nada. */
  readonly publishes: readonly ListingOwnerKindValue[];
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

/** Lo disponible de un plan de publicación contratado en el portal. */
export interface PortalCreditView {
  readonly plan: string;
  readonly available: number;
  readonly contracted: number | undefined;
  readonly publishes: ListingOwnerKindValue;
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

export const LISTING_SCOPE_VALUES = ['operation', 'property'] as const;
export type ListingScopeValue = (typeof LISTING_SCOPE_VALUES)[number];

/** El código de un plan del portal (en Zonaprop, `SIMPLE`, `HOME`…). */
export const PortalPlanSchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9_]{1,64}$/, 'Ese plan no existe en el portal.');

/**
 * Publicar una propiedad en un portal (o volver a publicarla). En los portales con un aviso por
 * operación (ML) se elige la operación y simple o destacado; en los de un aviso por propiedad
 * (Zonaprop), el plan.
 */
export const RequestPublicationInputSchema = z.object({
  propertyId: z.uuid(),
  portal: PortalSchema.default('mercadolibre'),
  operation: z.enum(LISTING_OPERATION_VALUES).optional(),
  listingType: z.enum(LISTING_TYPE_VALUES).default('simple'),
  plan: PortalPlanSchema.optional(),
});
export type RequestPublicationInput = z.input<typeof RequestPublicationInputSchema>;

export const ListingIdInputSchema = z.object({ listingId: z.uuid() });
export type ListingIdInput = z.input<typeof ListingIdInputSchema>;

export const ChangeListingTypeInputSchema = z.object({
  listingId: z.uuid(),
  listingType: z.enum(LISTING_TYPE_VALUES),
});
export type ChangeListingTypeInput = z.input<typeof ChangeListingTypeInputSchema>;

export const ChangeListingPlanInputSchema = z.object({
  listingId: z.uuid(),
  plan: PortalPlanSchema,
});
export type ChangeListingPlanInput = z.input<typeof ChangeListingPlanInputSchema>;

export const PropertyListingsInputSchema = z.object({ propertyId: z.uuid() });
export type PropertyListingsInput = z.input<typeof PropertyListingsInputSchema>;

/** Un portal donde se puede publicar la propiedad. */
export interface PortalPublishingView {
  readonly portal: PortalValue;
  readonly listingScope: ListingScopeValue;
  readonly choosesPlan: boolean;
}

/** Una publicación en la pestaña Difusión de la ficha. */
export interface PropertyListingView {
  readonly id: string;
  readonly portal: PortalValue;
  /** Sin operación: el aviso lleva todas las operaciones de la propiedad. */
  readonly operation: ListingOperationValue | undefined;
  readonly listingType: ListingTypeValue;
  readonly plan: string | undefined;
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
  /** Cuentas activas que publican propiedades sueltas, y cómo se arma su aviso. */
  readonly portals: readonly PortalPublishingView[];
  readonly canPublish: boolean;
}

// ---------- Avisos que ya están en el portal (Tokko) ----------

export const MAX_REMOTE_LISTINGS_PAGE_SIZE = 50;

/** Los avisos online de la cuenta, para vincularlos (Mi empresa → Portales). */
export const ListRemoteListingsInputSchema = z.object({
  portal: PortalSchema,
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_REMOTE_LISTINGS_PAGE_SIZE).default(20),
});
export type ListRemoteListingsInput = z.input<typeof ListRemoteListingsInputSchema>;

/**
 * El aviso del portal: su ID, o el link que se copia del portal (termina en el ID:
 * `…-59617389.html`).
 */
export const RemoteListingIdSchema = z
  .string()
  .trim()
  .transform((value) => /(\d{4,})(?:\.html)?\/?(?:[?#].*)?$/.exec(value)?.[1])
  .pipe(z.string({ error: 'Pegá el link del aviso o su número.' }));

/** Vincular un aviso que ya está online a una propiedad, sin republicarlo. */
export const LinkPortalListingInputSchema = z.object({
  portal: PortalSchema,
  propertyId: z.uuid(),
  remoteId: RemoteListingIdSchema,
  /** El plan, si el portal no lo informa en el aviso. */
  plan: PortalPlanSchema.optional(),
});
export type LinkPortalListingInput = z.input<typeof LinkPortalListingInputSchema>;

/** Un aviso online del portal, con la propiedad que le corresponde por código. */
export interface RemoteListingView {
  readonly remoteId: string;
  readonly title: string;
  readonly reference: string | undefined;
  readonly plan: string | undefined;
  readonly location: string | undefined;
  readonly permalink: string | undefined;
  readonly isDevelopment: boolean;
  /** La propiedad con el mismo código de referencia, si hay una. */
  readonly match:
    { readonly propertyId: string; readonly code: string; readonly title: string } | undefined;
  /** Ya vinculado: la publicación del sistema que lo maneja. */
  readonly linked: { readonly listingId: string; readonly propertyId: string } | undefined;
}
