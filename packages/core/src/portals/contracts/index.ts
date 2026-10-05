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
