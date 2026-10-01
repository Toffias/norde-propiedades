// Interesados y envíos de una propiedad (#6): lo que la ficha muestra del lado de los clientes.

import { z } from 'zod';

import { pageQuerySchema } from '../../shared/contracts';

/**
 * Lo que de una propiedad se compara con las búsquedas guardadas. Lo arma el módulo de
 * propiedades; acá solo se usa por valor.
 */
export interface PropertyInterestProfile {
  readonly propertyId: string;
  readonly propertyType: string;
  readonly operations: readonly {
    readonly operation: string;
    readonly currency: string;
    readonly priceCents: bigint | undefined;
  }[];
  /** La ubicación de la propiedad y sus ancestros: una búsqueda por barrio o por ciudad la cubre. */
  readonly locationIds: readonly string[];
  readonly rooms: number | undefined;
}

export const PropertyInterestQuerySchema = pageQuerySchema({
  sortable: ['updatedAt'],
  defaultSort: { field: 'updatedAt', direction: 'desc' },
}).extend({ propertyId: z.uuid() });
export type PropertyInterestInput = z.input<typeof PropertyInterestQuerySchema>;

/** Un cliente con una búsqueda guardada que coincide con la propiedad. */
export interface InterestedClientRow {
  readonly clientId: string;
  readonly clientName: string | undefined;
  readonly savedSearchId: string;
  readonly savedSearchName: string | undefined;
  readonly operation: string;
  readonly agent: { readonly id: string; readonly name: string | undefined } | undefined;
  readonly updatedAt: Date;
}

export const PROPERTY_SEND_CHANNEL_VALUES = ['email', 'whatsapp'] as const;
export const PROPERTY_REACTION_VALUES = ['liked', 'disliked'] as const;

export const PropertySendsQuerySchema = pageQuerySchema({
  sortable: ['sentAt'],
  defaultSort: { field: 'sentAt', direction: 'desc' },
}).extend({ propertyId: z.uuid() });
export type PropertySendsInput = z.input<typeof PropertySendsQuerySchema>;

/** Un envío de la ficha a un cliente, con lo que hizo con el link. */
export interface PropertySendRow {
  readonly sharedListingId: string;
  readonly clientId: string;
  readonly clientName: string | undefined;
  readonly channel: (typeof PROPERTY_SEND_CHANNEL_VALUES)[number];
  readonly sentAt: Date;
  readonly sentBy: { readonly id: string; readonly name: string | undefined };
  readonly openCount: number;
  readonly firstOpenedAt: Date | undefined;
  readonly reaction: (typeof PROPERTY_REACTION_VALUES)[number] | undefined;
}
