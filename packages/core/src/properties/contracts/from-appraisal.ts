import { z } from 'zod';

import { CONDITION_VALUES } from './detail';
import { CURRENCIES, PROPERTY_TYPES } from './values';

/** Centavos como texto: así viajan en el payload JSON del evento. */
const CentsText = z.string().regex(/^\d{1,15}$/);

const ListingPrice = z.object({ priceCents: CentsText, currency: z.enum(CURRENCIES) });

/** Solo originales de fotos de tasaciones: lo único que se copia a la galería. */
const AppraisalPhotoKey = z
  .string()
  .regex(/^appraisals\/[0-9a-f-]{36}\/photos\/[0-9a-f-]{36}\/original$/);

/**
 * El payload de `appraisals.appraisal_converted`: lo que hace falta para crear el borrador. La
 * propiedad se crea con `listing.propertyId`, que ya quedó en la tasación.
 */
export const CreatePropertyFromAppraisalInputSchema = z.object({
  appraisalId: z.uuid(),
  requesterClientId: z.uuid(),
  listing: z
    .object({
      propertyId: z.uuid(),
      appraisalCode: z.string().min(1).max(20),
      propertyType: z.enum(PROPERTY_TYPES),
      address: z.string().max(200).optional(),
      surfaceTotalM2: z.number().nonnegative().optional(),
      surfaceCoveredM2: z.number().nonnegative().optional(),
      rooms: z.number().int().nonnegative().optional(),
      bedrooms: z.number().int().nonnegative().optional(),
      bathrooms: z.number().int().nonnegative().optional(),
      condition: z.enum(CONDITION_VALUES).optional(),
      producerUserId: z.uuid(),
      branchId: z.uuid().optional(),
      appraiserUserId: z.uuid().optional(),
      sale: ListingPrice.optional(),
      rent: ListingPrice.optional(),
      photoKeys: z.array(AppraisalPhotoKey).max(30),
    })
    .refine((listing) => listing.sale !== undefined || listing.rent !== undefined, {
      message: 'La tasación convertida no tiene valores sugeridos.',
    }),
});
export type CreatePropertyFromAppraisalInput = z.infer<
  typeof CreatePropertyFromAppraisalInputSchema
>;
