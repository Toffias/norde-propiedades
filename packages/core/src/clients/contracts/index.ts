// Contracts del módulo clients (`@norde/core/clients/contracts`): importables desde el cliente.
// Los valores de los enums replican los del dominio (un test verifica que coincidan).

import { z } from 'zod';

export const CONTACT_CHANNEL_VALUES = [
  'whatsapp',
  'web_chat',
  'web_form',
  'mercadolibre',
  'zonaprop',
  'argenprop',
  'referral',
  'phone_call',
  'office',
] as const;

export const OPPORTUNITY_TYPE_VALUES = ['sale', 'rent', 'appraisal'] as const;
export const OPPORTUNITY_INTENT_VALUES = ['info', 'contact', 'visit'] as const;

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

export interface RegisterContactOutput {
  readonly clientId: string;
  readonly opportunityId: string;
  readonly clientCreated: boolean;
  readonly opportunityCreated: boolean;
}

export * from './property-interest';
export * from './clients-panel';
export * from './clients-tags';
export * from './clients-activity';
export * from './clients-erasure';
export * from './clients-import';
export * from './opportunity-settings';
