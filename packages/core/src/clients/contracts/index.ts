// Contracts del módulo clients (`@norde/core/clients/contracts`): importables desde el cliente.
// Los valores de los enums replican los del dominio (un test verifica que coincidan).

import { z } from 'zod';

import { CONTACT_CHANNEL_VALUES } from './contact-channels';

import { OPPORTUNITY_INTENT_VALUES, OPPORTUNITY_TYPE_VALUES } from './opportunity-values';

export * from './opportunity-values';

export const OpportunitySearchSchema = z.object({
  operation: z.string().trim().min(1).max(40).optional(),
  propertyType: z.string().trim().min(1).max(40).optional(),
  location: z.string().trim().min(1).max(100).optional(),
  currency: z.string().trim().min(1).max(3).optional(),
  minPriceCents: z.bigint().nonnegative().optional(),
  maxPriceCents: z.bigint().nonnegative().optional(),
  minRooms: z.int().min(0).max(50).optional(),
  maxRooms: z.int().min(0).max(50).optional(),
  minBedrooms: z.int().min(0).max(50).optional(),
  amenities: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
});

export const RegisterContactInputSchema = z.object({
  channel: z.enum(CONTACT_CHANNEL_VALUES),
  /** Identidad en el canal: teléfono (WhatsApp), sesión (web chat), ID del portal. */
  channelExternalId: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().min(1).max(40).optional(),
  email: z.string().trim().min(1).max(254).optional(),
  opportunity: z.object({
    type: z.enum(OPPORTUNITY_TYPE_VALUES),
    intent: z.enum(OPPORTUNITY_INTENT_VALUES),
    propertyId: z.uuid().optional(),
    search: OpportunitySearchSchema.optional(),
    /** Resumen para el asesor. */
    note: z.string().trim().min(1).max(2000).optional(),
    /** Norde no tiene hoy nada para ofrecerle: "Aplica a otra inmobiliaria". */
    noMatchingStock: z.boolean().default(false),
  }),
});

export type RegisterContactInput = z.input<typeof RegisterContactInputSchema>;

/**
 * `registered`: el cliente y su oportunidad quedaron registrados. `pending_review`: los datos no
 * están verificados (chat del sitio) y apuntan a un cliente que no es de esa charla, o la charla
 * ya registró a otro: solo quedó una consulta pendiente en la bandeja, sin tocar clientes (#221).
 */
export type RegisterContactOutput =
  | {
      readonly status: 'registered';
      readonly clientId: string;
      readonly opportunityId: string;
      readonly clientCreated: boolean;
      readonly opportunityCreated: boolean;
    }
  | { readonly status: 'pending_review'; readonly inquiryId: string };

export * from './property-interest';
export * from './clients-panel';
export * from './clients-tags';
export * from './clients-activity';
export * from './clients-erasure';
export * from './clients-import';
export * from './opportunity-settings';
export * from './opportunity-pipeline';
export * from './opportunity-bulk';
export * from './contact-channels';
export * from './inquiries';
export * from './inquiry-rules';
export * from './saved-searches';
export * from './shared-listings';
export * from './search-subscriptions';
export * from './quick-replies';
