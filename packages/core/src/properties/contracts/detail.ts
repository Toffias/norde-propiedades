// Contracts de la ficha de propiedad (#6): una edición en línea por sección.

import { z } from 'zod';

import { historyQuerySchema } from '../../audit/contracts';
import { pageQuerySchema } from '../../shared/contracts';

import { AmountSchema } from './amount';
import type { DevelopmentRef } from './developments';
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
export const PercentageSchema = z.preprocess(
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
  commissionPct: PercentageSchema.optional(),
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

// ---------- Historial ----------

/** Filtros de la pestaña Historial: qué tipo de cambio mostrar. */
export const PROPERTY_HISTORY_CATEGORY_VALUES = [
  'fields',
  'price',
  'status',
  'media',
  'files',
  'publication',
  'assignments',
  'reservations',
] as const;
export type PropertyHistoryCategory = (typeof PROPERTY_HISTORY_CATEGORY_VALUES)[number];

export const ListPropertyHistoryQuerySchema = historyQuerySchema().extend({
  propertyId: z.uuid(),
  category: z.enum(PROPERTY_HISTORY_CATEGORY_VALUES).optional(),
});
export type ListPropertyHistoryQuery = z.input<typeof ListPropertyHistoryQuerySchema>;

// ---------- Ficha (lectura) ----------

export interface PropertyLocationLevel {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
}

export interface PanelPropertyDetailOperation {
  readonly operation: (typeof OPERATIONS)[number];
  readonly currency: (typeof CURRENCIES)[number];
  readonly priceCents: bigint | undefined;
  readonly priceOnRequest: boolean;
  readonly commissionPct: number | undefined;
}

export interface PanelPropertyCustomAttribute {
  readonly id: string;
  readonly name: string;
  readonly kind: CustomAttributeKindValue;
  readonly options: readonly string[];
  readonly isActive: boolean;
  /** `undefined`: sin valor cargado. */
  readonly value: string | number | boolean | undefined;
}

export interface PanelUserRef {
  readonly id: string;
  /** `undefined` si el usuario ya no está activo. */
  readonly name: string | undefined;
}

/** La ficha completa del panel: también borradores, papelera y datos internos. */
export interface PanelPropertyDetail {
  readonly id: string;
  readonly code: string;
  readonly slug: string;
  readonly propertyType: string;
  readonly status: string;
  readonly statusChangedAt: Date;
  readonly address: {
    readonly street: string;
    readonly streetNumber: string | undefined;
    readonly floor: string | undefined;
    readonly unit: string | undefined;
    readonly neighborhood: string;
    readonly city: string;
    readonly province: string;
  };
  readonly publishAddress: string;
  readonly portalTitle: string;
  readonly description: string;
  readonly locationId: string | undefined;
  /** De la raíz (país) hacia abajo. */
  readonly locationPath: readonly PropertyLocationLevel[];
  readonly coordinates: { readonly latitude: number; readonly longitude: number } | undefined;
  readonly operations: readonly PanelPropertyDetailOperation[];
  readonly characteristics: {
    readonly rooms: number | undefined;
    readonly bedrooms: number | undefined;
    readonly bathrooms: number | undefined;
    readonly toilets: number | undefined;
    readonly parkingSpaces: number | undefined;
    readonly ageYears: number | undefined;
    readonly orientation: OrientationValue | undefined;
    readonly condition: ConditionValue | undefined;
    readonly disposition: DispositionValue | undefined;
    readonly isFurnished: boolean;
    readonly professionalUse: boolean;
    readonly surfaceTotalM2: number | undefined;
    readonly surfaceCoveredM2: number | undefined;
    readonly surfaceSemiCoveredM2: number | undefined;
    readonly surfaceLandM2: number | undefined;
    readonly frontM: number | undefined;
    readonly depthM: number | undefined;
  };
  readonly deal: {
    readonly isExclusive: boolean;
    readonly acceptsSwap: boolean;
    readonly immediateDeed: boolean;
    readonly hasFinancing: boolean;
    readonly creditEligible: boolean;
    readonly expensesCents: bigint | undefined;
  };
  readonly features: readonly {
    readonly id: string;
    readonly kind: string;
    readonly name: string;
  }[];
  readonly tags: readonly {
    readonly id: string;
    readonly name: string;
    readonly groupName: string | undefined;
  }[];
  /** Los atributos activos de Mi empresa, más los inactivos que tienen valor en esta propiedad. */
  readonly customAttributes: readonly PanelPropertyCustomAttribute[];
  readonly internal: {
    readonly maintenance: PanelUserRef | undefined;
    readonly appraisers: readonly PanelUserRef[];
    readonly keysLocation: string | undefined;
    readonly legalInfo: string | undefined;
    readonly internalComments: string | undefined;
  };
  readonly publication: {
    readonly publishedOnWeb: boolean;
    readonly showPriceOnWeb: boolean;
    readonly featured: boolean;
    readonly showExactAddress: boolean;
  };
  /** La web la muestra: publicada y disponible. */
  readonly isPubliclyListed: boolean;
  readonly producer: PanelUserRef | undefined;
  readonly branchId: string | undefined;
  /** Propietarios (clientes). Se cargan cuando exista el buscador de contactos (#8). */
  readonly owners: readonly { readonly id: string; readonly name: string }[];
  readonly cover: { readonly mediaId: string; readonly hasThumbnail: boolean } | undefined;
  readonly counts: { readonly media: number; readonly attachments: number };
  /** Emprendimiento al que pertenece, si es una unidad. */
  readonly development: DevelopmentRef | undefined;
  readonly createdAt: Date;
  readonly createdBy: PanelUserRef | undefined;
  readonly updatedAt: Date;
  readonly deletedAt: Date | undefined;
}

export const ListCustomAttributesQuerySchema = pageQuerySchema({
  sortable: ['position', 'name'],
  defaultSort: { field: 'position', direction: 'asc' },
});
export type ListCustomAttributesQuery = z.input<typeof ListCustomAttributesQuerySchema>;
