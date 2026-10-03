// Búsquedas guardadas de un cliente (#11): alta, edición, papelera y el panel de edición.

import { z } from 'zod';

import { AmountSchema, CURRENCIES, OPERATIONS, PROPERTY_TYPES } from '../../properties/contracts';

/** Replican los topes del dominio (un test verifica que coincidan). */
export const MAX_CLIENT_SAVED_SEARCHES = 20;
export const MAX_SAVED_SEARCH_LOCATION_COUNT = 20;
export const MAX_SAVED_SEARCH_NAME = 80;
export const MAX_SAVED_SEARCH_MIN_ROOMS = 20;

const SavedSearchFieldsSchema = z.object({
  name: z.string().trim().max(MAX_SAVED_SEARCH_NAME).optional(),
  operation: z.enum(OPERATIONS),
  propertyTypes: z.array(z.enum(PROPERTY_TYPES)).max(PROPERTY_TYPES.length).default([]),
  currency: z.enum(CURRENCIES).optional(),
  minPrice: AmountSchema.optional(),
  maxPrice: AmountSchema.optional(),
  locationIds: z.array(z.uuid()).max(MAX_SAVED_SEARCH_LOCATION_COUNT).default([]),
  minRooms: z.coerce.number().int().min(1).max(MAX_SAVED_SEARCH_MIN_ROOMS).optional(),
  autoSend: z.boolean().default(false),
  /** Oportunidad abierta del mismo cliente. */
  opportunityId: z.uuid().optional(),
});

/** Las reglas de precio también las valida el dominio: acá dan el mensaje del formulario. */
function checkPriceRange(
  value: {
    currency?: string | undefined;
    minPrice?: bigint | undefined;
    maxPrice?: bigint | undefined;
  },
  ctx: z.RefinementCtx,
) {
  const hasPrice = value.minPrice !== undefined || value.maxPrice !== undefined;
  if (hasPrice && value.currency === undefined) {
    ctx.addIssue({ code: 'custom', path: ['currency'], message: 'Elegí la moneda del precio.' });
  }
  if (
    value.minPrice !== undefined &&
    value.maxPrice !== undefined &&
    value.minPrice > value.maxPrice
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['maxPrice'],
      message: 'El precio máximo no puede ser menor que el mínimo.',
    });
  }
}

export const CreateSavedSearchInputSchema = SavedSearchFieldsSchema.extend({
  clientId: z.uuid(),
}).superRefine(checkPriceRange);
export type CreateSavedSearchInput = z.input<typeof CreateSavedSearchInputSchema>;
export type SavedSearchValues = z.output<typeof CreateSavedSearchInputSchema>;

/** Reemplaza todos los criterios: sin `opportunityId`, se desvincula. */
export const UpdateSavedSearchInputSchema = SavedSearchFieldsSchema.extend({
  clientId: z.uuid(),
  savedSearchId: z.uuid(),
}).superRefine(checkPriceRange);
export type UpdateSavedSearchInput = z.input<typeof UpdateSavedSearchInputSchema>;

export const SavedSearchRefInputSchema = z.object({
  clientId: z.uuid(),
  savedSearchId: z.uuid(),
});
export type SavedSearchRefInput = z.input<typeof SavedSearchRefInputSchema>;

export interface CreateSavedSearchOutput {
  readonly savedSearchId: string;
}

export interface SavedSearchLocationLabel {
  readonly id: string;
  readonly name: string;
  /** Los ancestros ("CABA, Argentina"), para distinguir homónimos. */
  readonly hint: string | undefined;
}

/** Lo que carga el panel de edición. */
export interface SavedSearchDetail {
  readonly id: string;
  readonly clientId: string;
  readonly name: string | undefined;
  readonly opportunityId: string | undefined;
  readonly operation: string;
  readonly propertyTypes: readonly string[];
  readonly currency: string | undefined;
  readonly minPriceCents: bigint | undefined;
  readonly maxPriceCents: bigint | undefined;
  /** Las que ya no existen en el catálogo no vienen. */
  readonly locations: readonly SavedSearchLocationLabel[];
  readonly minRooms: number | undefined;
  readonly autoSend: boolean;
  readonly unsubscribed: boolean;
  readonly deleted: boolean;
}
