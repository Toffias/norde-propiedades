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

export const PORTAL_PROVIDER_VALUES = ['mercadolibre', 'zonaprop'] as const;

/**
 * Un aviso del portal sobre una de sus cuentas (en MercadoLibre, el `user_id` de la notificación):
 * el proveedor y el ID de la cuenta en el portal.
 */
export const PortalAccountNoticeInputSchema = z.object({
  provider: z.enum(PORTAL_PROVIDER_VALUES),
  externalAccountId: z.string().trim().min(1).max(64),
});
export type PortalAccountNoticeInput = z.input<typeof PortalAccountNoticeInputSchema>;

/** El portal avisó que cambió un aviso de una de sus cuentas (MercadoLibre: `MLA…`). */
export const PortalListingNoticeInputSchema = PortalAccountNoticeInputSchema.extend({
  remoteId: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}\d{1,20}$/),
});
export type PortalListingNoticeInput = z.input<typeof PortalListingNoticeInputSchema>;

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
  /** Si se pueden vincular los avisos que la cuenta ya tiene online (Mi empresa → Avisos). */
  readonly linksExisting: boolean;
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

export const PORTAL_PACKAGE_CONTENT_VALUES = ['publications', 'upgrades', 'developments'] as const;
export type PortalPackageContentValue = (typeof PORTAL_PACKAGE_CONTENT_VALUES)[number];

/** El cupo de un tipo de aviso dentro de un paquete (en MercadoLibre: silver, gold, gold_premium). */
export interface PortalPackageQuotaView {
  readonly tier: string;
  readonly total: number;
  readonly used: number;
  readonly remaining: number;
}

/** Un paquete activo de una cuenta conectada por OAuth (MercadoLibre), leído del portal. */
export interface PortalPackageView {
  readonly id: string;
  readonly name: string;
  readonly content: PortalPackageContentValue;
  readonly expiresAt: Date | undefined;
  readonly quotas: readonly PortalPackageQuotaView[];
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

export const DevelopmentListingsInputSchema = z.object({ developmentId: z.uuid() });
export type DevelopmentListingsInput = z.input<typeof DevelopmentListingsInputSchema>;

/** Las publicaciones de una propiedad o de un emprendimiento. */
export const ListingOwnerInputSchema = z.union([
  PropertyListingsInputSchema,
  DevelopmentListingsInputSchema,
]);
export type ListingOwnerInput = z.input<typeof ListingOwnerInputSchema>;

/**
 * Publicar un emprendimiento con sus unidades disponibles en un portal (o volver a publicarlo), con
 * el plan elegido entre los de emprendimientos de la cuenta.
 */
export const RequestDevelopmentPublicationInputSchema = z.object({
  developmentId: z.uuid(),
  portal: PortalSchema,
  plan: PortalPlanSchema.optional(),
});
export type RequestDevelopmentPublicationInput = z.input<
  typeof RequestDevelopmentPublicationInputSchema
>;

/** Un portal donde se puede publicar la propiedad. */
export interface PortalPublishingView {
  readonly portal: PortalValue;
  readonly listingScope: ListingScopeValue;
  readonly choosesPlan: boolean;
  /** Si se puede vincular un aviso que ya está online (lo publicó Tokko). */
  readonly linksExisting: boolean;
  /** Si una unidad de un emprendimiento puede tener su propio aviso (MercadoLibre). */
  readonly unitsAsListings: boolean;
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

/**
 * La pestaña Difusión: las publicaciones y los portales donde se puede publicar esta propiedad (o
 * este emprendimiento).
 */
export interface PropertyListingsView {
  readonly listings: readonly PropertyListingView[];
  /** Cuentas activas que publican ese tipo de aviso, y cómo se arma su aviso. */
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
 * El aviso del portal: su ID, o el link que se copia del portal.
 * - MercadoLibre: `MLA1592938055`, o un link con `MLA-1592938055-…` (queda `MLA1592938055`).
 * - Zonaprop: el número, o el link que termina en él (`…-59617389.html`).
 */
export const RemoteListingIdSchema = z
  .string()
  .trim()
  .transform((value) => {
    const mercadoLibre = /\b(ML[A-Z])-?(\d{6,})/i.exec(value);
    if (mercadoLibre) return `${(mercadoLibre[1] ?? '').toUpperCase()}${mercadoLibre[2] ?? ''}`;
    return /(\d{4,})(?:\.html)?\/?(?:[?#].*)?$/.exec(value)?.[1];
  })
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
  /** La operación del aviso, en los portales con un aviso por operación (MercadoLibre). */
  readonly operation: ListingOperationValue | undefined;
  readonly reference: string | undefined;
  readonly plan: string | undefined;
  readonly location: string | undefined;
  readonly permalink: string | undefined;
  readonly isDevelopment: boolean;
  /** La propiedad con el mismo código de referencia, si hay una. */
  readonly match:
    { readonly propertyId: string; readonly code: string; readonly title: string } | undefined;
  /** Ya vinculado: la publicación del sistema que lo maneja, y de qué es. */
  readonly linked: { readonly listingId: string; readonly owner: ListingOwnerView } | undefined;
}

/** De qué es una publicación: una propiedad o un emprendimiento. */
export interface ListingOwnerView {
  readonly kind: ListingOwnerKindValue;
  readonly id: string;
}

/** Los emprendimientos online de la cuenta, para vincularlos (Mi empresa → Portales). */
export const ListRemoteDevelopmentsInputSchema = ListRemoteListingsInputSchema;
export type ListRemoteDevelopmentsInput = z.input<typeof ListRemoteDevelopmentsInputSchema>;

/** Un emprendimiento online del portal, con el de Norde que le corresponde por código. */
export interface RemoteDevelopmentView {
  readonly remoteId: string;
  readonly title: string;
  readonly reference: string | undefined;
  readonly plan: string | undefined;
  readonly location: string | undefined;
  readonly permalink: string | undefined;
  readonly unitCount: number;
  /** El emprendimiento con el mismo código, si hay uno. */
  readonly match:
    { readonly developmentId: string; readonly code: string; readonly name: string } | undefined;
  /** Ya vinculado: la publicación del sistema que lo maneja. */
  readonly linked: { readonly listingId: string; readonly developmentId: string } | undefined;
}

/** Vincular un emprendimiento que ya está online, con sus unidades, sin republicarlo. */
export const LinkDevelopmentListingInputSchema = z.object({
  portal: PortalSchema,
  developmentId: z.uuid(),
  remoteId: RemoteListingIdSchema,
  /** El plan del aviso; sin elegir, el que informa el portal. */
  plan: PortalPlanSchema.optional(),
});
export type LinkDevelopmentListingInput = z.input<typeof LinkDevelopmentListingInputSchema>;
