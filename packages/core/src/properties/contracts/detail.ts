// Contracts de la ficha de propiedad (#6): una edición en línea por sección.

import { z } from 'zod';

import { AmountSchema } from './amount';
import { CURRENCIES, MANUAL_STATUS_VALUES, OPERATIONS } from './values';

export const ORIENTATION_VALUES = [
  'north',
  'south',
  'east',
  'west',
  'northeast',
  'northwest',
  'southeast',
  'southwest',
] as const;
export type OrientationValue = (typeof ORIENTATION_VALUES)[number];

export const CONDITION_VALUES = [
  'brand_new',
  'excellent',
  'very_good',
  'good',
  'fair',
  'to_renovate',
] as const;
export type ConditionValue = (typeof CONDITION_VALUES)[number];

export const DISPOSITION_VALUES = ['front', 'back', 'internal', 'lateral'] as const;
export type DispositionValue = (typeof DISPOSITION_VALUES)[number];

export const CUSTOM_ATTRIBUTE_KIND_VALUES = ['text', 'number', 'boolean', 'select'] as const;
export type CustomAttributeKindValue = (typeof CUSTOM_ATTRIBUTE_KIND_VALUES)[number];

const PropertyId = { propertyId: z.uuid() };
const OptionalText = (max: number) => z.string().trim().min(1).max(max).optional();
/** Cantidades enteras (ambientes, dormitorios, años): vacío es "sin dato". */
const OptionalCount = z.coerce.number().int('Ingresá un número entero.').min(0).max(999).optional();
/** Metros con hasta dos decimales. */
const OptionalMeters = z.coerce
  .number()
  .min(0)
  .max(10_000_000)
  .refine(hasTwoDecimals, { message: 'Usá hasta dos decimales.' })
  .optional();

function hasTwoDecimals(value: number): boolean {
  return Math.abs(Math.round(value * 100) - value * 100) < 1e-9;
}

/** Porcentaje con hasta dos decimales ("3", "4,5"). */
const Percentage = z.preprocess(
  (value) => (typeof value === 'string' ? value.replace(',', '.') : value),
  z.coerce
    .number()
    .min(0, 'La comisión va de 0 a 100.')
    .max(100, 'La comisión va de 0 a 100.')
    .refine(hasTwoDecimals, { message: 'Usá hasta dos decimales.' }),
);

// ---------- Ubicación y código ----------

export const UpdatePropertyLocationInputSchema = z
  .object({
    ...PropertyId,
    street: z.string().trim().min(1).max(120),
    streetNumber: OptionalText(20),
    floor: OptionalText(10),
    unit: OptionalText(10),
    locationId: z.uuid().optional(),
    neighborhood: OptionalText(80),
    city: OptionalText(80),
    province: OptionalText(80),
    /** Vacío: se sugiere a partir de la calle y la altura. */
    publishAddress: OptionalText(150),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine((input) => (input.latitude === undefined) === (input.longitude === undefined), {
    message: 'Completá la latitud y la longitud, o ninguna de las dos.',
    path: ['longitude'],
  })
  .refine(
    (input) =>
      input.locationId !== undefined ||
      (input.neighborhood !== undefined &&
        input.city !== undefined &&
        input.province !== undefined),
    {
      message: 'Elegí la ubicación en el buscador o completá barrio, localidad y provincia.',
      path: ['locationId'],
    },
  );
export type UpdatePropertyLocationInput = z.input<typeof UpdatePropertyLocationInputSchema>;

export const ChangePropertyCodeInputSchema = z.object({
  ...PropertyId,
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9-]{1,19}$/, 'Usá de 2 a 20 letras, números o guiones.'),
});
export type ChangePropertyCodeInput = z.input<typeof ChangePropertyCodeInputSchema>;

// ---------- Operaciones y estado ----------

export const PropertyOperationInputSchema = z.object({
  operation: z.enum(OPERATIONS),
  currency: z.enum(CURRENCIES),
  /** En unidades; vacío: sin precio cargado. */
  price: AmountSchema.optional(),
  priceOnRequest: z.boolean().default(false),
  commissionPct: Percentage.optional(),
});

export const UpdatePropertyOperationsInputSchema = z.object({
  ...PropertyId,
  operations: z
    .array(PropertyOperationInputSchema)
    .min(1, 'La propiedad tiene que tener al menos una operación.')
    .max(OPERATIONS.length)
    .refine((list) => new Set(list.map((o) => o.operation)).size === list.length, {
      message: 'Cada operación va una sola vez.',
    }),
});
export type UpdatePropertyOperationsInput = z.input<typeof UpdatePropertyOperationsInputSchema>;

export const ChangePropertyStatusInputSchema = z.object({
  ...PropertyId,
  status: z.enum(MANUAL_STATUS_VALUES),
});
export type ChangePropertyStatusInput = z.input<typeof ChangePropertyStatusInputSchema>;

// ---------- Características y condiciones ----------

export const UpdatePropertyCharacteristicsInputSchema = z.object({
  ...PropertyId,
  rooms: OptionalCount,
  bedrooms: OptionalCount,
  bathrooms: OptionalCount,
  toilets: OptionalCount,
  parkingSpaces: OptionalCount,
  ageYears: OptionalCount,
  orientation: z.enum(ORIENTATION_VALUES).optional(),
  condition: z.enum(CONDITION_VALUES).optional(),
  disposition: z.enum(DISPOSITION_VALUES).optional(),
  isFurnished: z.boolean().default(false),
  professionalUse: z.boolean().default(false),
  surfaceTotalM2: OptionalMeters,
  surfaceCoveredM2: OptionalMeters,
  surfaceSemiCoveredM2: OptionalMeters,
  surfaceLandM2: OptionalMeters,
  frontM: OptionalMeters,
  depthM: OptionalMeters,
});
export type UpdatePropertyCharacteristicsInput = z.input<
  typeof UpdatePropertyCharacteristicsInputSchema
>;

export const UpdatePropertyDealInputSchema = z.object({
  ...PropertyId,
  isExclusive: z.boolean().default(false),
  acceptsSwap: z.boolean().default(false),
  immediateDeed: z.boolean().default(false),
  hasFinancing: z.boolean().default(false),
  creditEligible: z.boolean().default(false),
  /** Expensas mensuales en pesos; vacío: sin expensas. */
  expenses: AmountSchema.optional(),
});
export type UpdatePropertyDealInput = z.input<typeof UpdatePropertyDealInputSchema>;

/** Tope de ítems de catálogo por propiedad: el catálogo entero entra en una pantalla. */
export const MAX_PROPERTY_FEATURES = 200;

export const UpdatePropertyFeaturesInputSchema = z.object({
  ...PropertyId,
  featureIds: z.array(z.uuid()).max(MAX_PROPERTY_FEATURES),
});
export type UpdatePropertyFeaturesInput = z.input<typeof UpdatePropertyFeaturesInputSchema>;

export const MAX_DESCRIPTION_LENGTH = 10_000;

export const UpdatePropertyDescriptionInputSchema = z.object({
  ...PropertyId,
  /** Vacío: se sugiere a partir del tipo, la operación y el barrio. */
  portalTitle: OptionalText(120),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).default(''),
});
export type UpdatePropertyDescriptionInput = z.input<typeof UpdatePropertyDescriptionInputSchema>;

export const MAX_CUSTOM_ATTRIBUTES = 50;

export const UpdatePropertyCustomAttributesInputSchema = z.object({
  ...PropertyId,
  values: z
    .array(
      z.object({
        attributeId: z.uuid(),
        value: z.union([z.string().max(500), z.number(), z.boolean()]),
      }),
    )
    .max(MAX_CUSTOM_ATTRIBUTES),
});
export type UpdatePropertyCustomAttributesInput = z.input<
  typeof UpdatePropertyCustomAttributesInputSchema
>;

// ---------- Etiquetas, captador e información interna ----------

export const MAX_PROPERTY_TAGS = 50;

/** Las etiquetas que quedan: el caso de uso calcula cuáles se suman y cuáles se quitan. */
export const ChangePropertyTagsInputSchema = z.object({
  ...PropertyId,
  tagIds: z.array(z.uuid()).max(MAX_PROPERTY_TAGS, `Hasta ${MAX_PROPERTY_TAGS} etiquetas.`),
});
export type ChangePropertyTagsInput = z.input<typeof ChangePropertyTagsInputSchema>;

export const ChangePropertyProducerInputSchema = z.object({ ...PropertyId, userId: z.uuid() });
export type ChangePropertyProducerInput = z.input<typeof ChangePropertyProducerInputSchema>;

export const MAX_APPRAISERS = 10;

export const UpdatePropertyInternalInfoInputSchema = z.object({
  ...PropertyId,
  maintenanceUserId: z.uuid().optional(),
  appraiserUserIds: z.array(z.uuid()).max(MAX_APPRAISERS).default([]),
  keysLocation: OptionalText(200),
  legalInfo: OptionalText(2000),
  internalComments: OptionalText(4000),
});
export type UpdatePropertyInternalInfoInput = z.input<typeof UpdatePropertyInternalInfoInputSchema>;

// ---------- Publicación ----------

export const UpdatePropertyPublicationInputSchema = z
  .object({
    ...PropertyId,
    publishedOnWeb: z.boolean().optional(),
    showPriceOnWeb: z.boolean().optional(),
    featured: z.boolean().optional(),
    showExactAddress: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.publishedOnWeb !== undefined ||
      input.showPriceOnWeb !== undefined ||
      input.featured !== undefined ||
      input.showExactAddress !== undefined,
    { message: 'Elegí qué cambiar de la publicación.' },
  );
export type UpdatePropertyPublicationInput = z.input<typeof UpdatePropertyPublicationInputSchema>;

// ---------- Atributos personalizados (Mi empresa) ----------

export const MAX_CUSTOM_ATTRIBUTE_OPTIONS = 30;

const CustomAttributeFields = {
  name: z.string().trim().min(1).max(60),
  /** Solo para los `select`. */
  options: z.array(z.string().trim().min(1).max(60)).max(MAX_CUSTOM_ATTRIBUTE_OPTIONS).default([]),
  isActive: z.boolean().default(true),
};

export const CreateCustomAttributeInputSchema = z
  .object({ ...CustomAttributeFields, kind: z.enum(CUSTOM_ATTRIBUTE_KIND_VALUES) })
  .refine((input) => input.kind !== 'select' || input.options.length > 0, {
    message: 'Un atributo de lista necesita al menos una opción.',
    path: ['options'],
  });
export type CreateCustomAttributeInput = z.input<typeof CreateCustomAttributeInputSchema>;

/** El tipo no se cambia: los valores ya cargados dejarían de ser válidos. */
export const UpdateCustomAttributeInputSchema = z.object({
  attributeId: z.uuid(),
  ...CustomAttributeFields,
});
export type UpdateCustomAttributeInput = z.input<typeof UpdateCustomAttributeInputSchema>;

export interface CustomAttributeRow {
  readonly id: string;
  readonly name: string;
  readonly kind: CustomAttributeKindValue;
  readonly options: readonly string[];
  readonly isActive: boolean;
}
