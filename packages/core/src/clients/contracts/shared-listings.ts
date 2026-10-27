// Envíos de propiedades por email o WhatsApp y su página pública `/e/<token>` (#104).

import { z } from 'zod';

import { pageQuerySchema } from '../../shared/contracts';

import { PROPERTY_REACTION_VALUES, PROPERTY_SEND_CHANNEL_VALUES } from './property-interest';

/** Replica `MAX_SHARED_PROPERTIES` del dominio. */
export const MAX_SHARED_PROPERTY_COUNT = 20;
/** Replica `SHARED_LISTING_LIFETIME_DAYS` del dominio. */
export const SHARED_LISTING_LIFETIME_DAY_COUNT = 90;
/** Largo máximo del mensaje del asesor. */
export const MAX_SEND_MESSAGE_LENGTH = 1000;

export const SHARED_LISTING_CHANNEL_LABELS: Readonly<
  Record<(typeof PROPERTY_SEND_CHANNEL_VALUES)[number], string>
> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
};

export const SendListingsInputSchema = z.object({
  clientId: z.uuid(),
  propertyIds: z
    .array(z.uuid())
    .min(1, 'Elegí al menos una propiedad.')
    .max(
      MAX_SHARED_PROPERTY_COUNT,
      `Se pueden enviar hasta ${MAX_SHARED_PROPERTY_COUNT} propiedades por vez.`,
    ),
  channel: z.enum(PROPERTY_SEND_CHANNEL_VALUES),
  /** Uno de los emails o teléfonos del contacto. Sin elegir, el primero. */
  recipient: z.string().trim().min(1).max(254).optional(),
  message: z
    .string()
    .trim()
    .max(
      MAX_SEND_MESSAGE_LENGTH,
      `El mensaje puede tener hasta ${MAX_SEND_MESSAGE_LENGTH} caracteres.`,
    )
    .optional(),
});
export type SendListingsInput = z.input<typeof SendListingsInputSchema>;

export interface SendListingsOutput {
  readonly sharedListingId: string;
  /** El link público del envío. */
  readonly url: string;
  /** Por WhatsApp: el link `wa.me` que abre el WhatsApp del asesor con el mensaje escrito. */
  readonly whatsappUrl: string | undefined;
}

export const RevokeSharedListingInputSchema = z.object({
  clientId: z.uuid(),
  sharedListingId: z.uuid(),
});
export type RevokeSharedListingInput = z.input<typeof RevokeSharedListingInputSchema>;

/** El token del link: 32 bytes al azar en base64url. */
export const SharedListingTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const SharedListingTokenInputSchema = z.object({ token: SharedListingTokenSchema });
export type SharedListingTokenInput = z.input<typeof SharedListingTokenInputSchema>;

export const ReactToSharedListingInputSchema = z.object({
  token: SharedListingTokenSchema,
  propertyId: z.uuid(),
  reaction: z.enum(PROPERTY_REACTION_VALUES),
});
export type ReactToSharedListingInput = z.input<typeof ReactToSharedListingInputSchema>;

/**
 * Lo que la página pública sabe de un envío: sus propiedades (por ID; las tarjetas las arma la
 * web) y quién lo mandó. Nada del cliente.
 */
export interface PublicSharedListing {
  readonly expiresAt: Date;
  readonly advisorName: string | undefined;
  readonly items: readonly {
    readonly propertyId: string;
    readonly reaction: (typeof PROPERTY_REACTION_VALUES)[number] | undefined;
  }[];
}

export const ListClientSendsQuerySchema = pageQuerySchema({
  sortable: ['sentAt'],
  defaultSort: { field: 'sentAt', direction: 'desc' },
}).extend({ clientId: z.uuid() });
export type ListClientSendsQuery = z.input<typeof ListClientSendsQuerySchema>;

export const SHARED_LISTING_STATUS_VALUES = ['available', 'expired', 'revoked'] as const;
export type SharedListingStatusValue = (typeof SHARED_LISTING_STATUS_VALUES)[number];

export const SHARED_LISTING_STATUS_LABELS: Readonly<Record<SharedListingStatusValue, string>> = {
  available: 'Vigente',
  expired: 'Vencido',
  revoked: 'Revocado',
};

/** Un envío al contacto, con lo que hizo con el link. */
export interface ClientSendRow {
  readonly id: string;
  readonly channel: (typeof PROPERTY_SEND_CHANNEL_VALUES)[number];
  readonly sentAt: Date;
  readonly sentBy: { readonly id: string; readonly name: string | undefined };
  readonly expiresAt: Date;
  readonly status: SharedListingStatusValue;
  readonly properties: readonly {
    readonly id: string;
    /** `undefined` si la propiedad ya no está en la cartera. */
    readonly code: string | undefined;
    readonly reaction: (typeof PROPERTY_REACTION_VALUES)[number] | undefined;
  }[];
  readonly firstOpenedAt: Date | undefined;
  readonly openCount: number;
  readonly can: { readonly revoke: boolean };
}
