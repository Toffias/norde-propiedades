// Suscripción a una búsqueda desde el buscador de la web, con confirmación por email (#208).

import { z } from 'zod';

import { AmountSchema, CURRENCIES, OPERATIONS, PROPERTY_TYPES } from '../../properties/contracts';

import {
  MAX_SAVED_SEARCH_LOCATION_COUNT,
  MAX_SAVED_SEARCH_MIN_ROOMS,
  WEB_FOLLOW_UP_FREQUENCY_VALUES,
} from './saved-searches';
import { SharedListingTokenSchema } from './shared-listings';

/** Lo que manda la web al pedir la suscripción (por el webhook firmado de apps/gestion). */
export const RequestSearchSubscriptionInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().min(1).max(254),
    frequency: z.enum(WEB_FOLLOW_UP_FREQUENCY_VALUES),
    /** Cómo titula la web la búsqueda: "Departamentos en venta en Palermo". */
    summary: z.string().trim().min(1).max(200),
    operation: z.enum(OPERATIONS),
    propertyTypes: z.array(z.enum(PROPERTY_TYPES)).max(PROPERTY_TYPES.length).default([]),
    currency: z.enum(CURRENCIES).optional(),
    minPrice: AmountSchema.optional(),
    maxPrice: AmountSchema.optional(),
    locationIds: z.array(z.uuid()).max(MAX_SAVED_SEARCH_LOCATION_COUNT).default([]),
    minRooms: z.coerce.number().int().min(1).max(MAX_SAVED_SEARCH_MIN_ROOMS).optional(),
  })
  .refine(
    (value) =>
      (value.minPrice === undefined && value.maxPrice === undefined) ||
      value.currency !== undefined,
    {
      path: ['currency'],
      message: 'Elegí la moneda del precio.',
    },
  );
export type RequestSearchSubscriptionInput = z.input<typeof RequestSearchSubscriptionInputSchema>;

/**
 * Siempre la misma respuesta, se haya mandado el email o no (tope por email): la web no puede
 * averiguar qué casillas ya pidieron.
 */
export interface RequestSearchSubscriptionOutput {
  readonly requested: true;
}

export const SearchSubscriptionTokenInputSchema = z.object({ token: SharedListingTokenSchema });
export type SearchSubscriptionTokenInput = z.input<typeof SearchSubscriptionTokenInputSchema>;

/** Lo que muestra la página de confirmación antes y después del botón. */
export interface SearchSubscriptionView {
  readonly summary: string;
  readonly frequency: (typeof WEB_FOLLOW_UP_FREQUENCY_VALUES)[number];
  readonly status: 'pending' | 'confirmed' | 'expired';
}
