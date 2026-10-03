// Emprendimientos (#7): desarrollos en pozo o en construcción que agrupan unidades. Cada unidad es
// una propiedad con `developmentId`.

import { z } from 'zod';

import { historyQuerySchema } from '../../audit/contracts';
import { pageQuerySchema } from '../../shared/contracts';

import { AmountSchema } from './amount';
import { CURRENCIES, OPERATIONS, PROPERTY_TYPES } from './values';

/** `loading`: cargando información (no se publica). `marketing`: comercializando. */
export const DEVELOPMENT_STATUS_VALUES = ['loading', 'marketing'] as const;
export type DevelopmentStatusValue = (typeof DEVELOPMENT_STATUS_VALUES)[number];

/** Tipo de desarrollo, como lo agrupan los portales de emprendimientos. */
export const DEVELOPMENT_TYPES = [
  'building',
  'gated_community',
  'housing_complex',
  'office_building',
  'lots',
  'other',
] as const;
export type DevelopmentType = (typeof DEVELOPMENT_TYPES)[number];

/** Estado de obra. */
export const CONSTRUCTION_STATUS_VALUES = ['pre_sale', 'under_construction', 'finished'] as const;
export type ConstructionStatusValue = (typeof CONSTRUCTION_STATUS_VALUES)[number];

const DevelopmentId = { developmentId: z.uuid() };
const OptionalText = (max: number) => z.string().trim().min(1).max(max).optional();
const CoordinateFields = {
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
};
const bothOrNoneCoordinates = {
  check: (input: {
    readonly latitude?: number | undefined;
    readonly longitude?: number | undefined;
  }) => (input.latitude === undefined) === (input.longitude === undefined),
  params: {
    message: 'Completá la latitud y la longitud, o ninguna de las dos.',
    path: ['longitude'],
  },
};

export const MAX_DEVELOPMENT_DESCRIPTION_LENGTH = 10_000;
/** Tope de ítems de catálogo y de etiquetas: el catálogo entero entra en una pantalla. */
export const MAX_DEVELOPMENT_FEATURES = 200;
export const MAX_DEVELOPMENT_TAGS = 50;

// ---------- Alta ----------

export const CreateDevelopmentInputSchema = z
  .object({
    /** Nombre público ("Torre Gurruchaga"). */
    name: z.string().trim().min(1).max(120),
    developmentType: z.enum(DEVELOPMENT_TYPES),
    /** Dirección exacta: privada, no se publica. */
    privateAddress: z.string().trim().min(1).max(150),
    /** Vacío: se publica la dirección privada sin la altura exacta. */
    publishAddress: OptionalText(150),
    /** Vacío: se usa el nombre. */
    portalTitle: OptionalText(120),
    /** Desarrollista y contacto comercial: privados. */
    developerName: OptionalText(120),
    commercialContactClientId: z.uuid().optional(),
    /** Ubicación del catálogo: las unidades la heredan. */
    locationId: z.uuid(),
    ...CoordinateFields,
  })
  .refine(bothOrNoneCoordinates.check, bothOrNoneCoordinates.params);
export type CreateDevelopmentInput = z.input<typeof CreateDevelopmentInputSchema>;

export const DevelopmentIdInputSchema = z.object(DevelopmentId);
export type DevelopmentIdInput = z.input<typeof DevelopmentIdInputSchema>;

// ---------- Ficha: edición por sección ----------

/** Nombre, tipo, título para portales, desarrollista, contacto comercial y página web. */
export const UpdateDevelopmentGeneralInputSchema = z.object({
  ...DevelopmentId,
  name: z.string().trim().min(1).max(120),
  developmentType: z.enum(DEVELOPMENT_TYPES),
  portalTitle: OptionalText(120),
  developerName: OptionalText(120),
  commercialContactClientId: z.uuid().optional(),
  websiteUrl: z.url('Ingresá una dirección web válida.').max(300).optional(),
});
export type UpdateDevelopmentGeneralInput = z.input<typeof UpdateDevelopmentGeneralInputSchema>;

export const UpdateDevelopmentLocationInputSchema = z
  .object({
    ...DevelopmentId,
    privateAddress: z.string().trim().min(1).max(150),
    publishAddress: OptionalText(150),
    locationId: z.uuid(),
    ...CoordinateFields,
  })
  .refine(bothOrNoneCoordinates.check, bothOrNoneCoordinates.params);
export type UpdateDevelopmentLocationInput = z.input<typeof UpdateDevelopmentLocationInputSchema>;

/** Estado de obra, entrega, descripción, atributos de operación y financiación. */
export const UpdateDevelopmentDetailsInputSchema = z.object({
  ...DevelopmentId,
  constructionStatus: z.enum(CONSTRUCTION_STATUS_VALUES).optional(),
  /** Fecha estimada de entrega (`AAAA-MM-DD`). */
  deliveryDate: z.iso.date('Ingresá una fecha válida.').optional(),
  description: z.string().max(MAX_DEVELOPMENT_DESCRIPTION_LENGTH).default(''),
  isFinanced: z.boolean().default(false),
  acceptsSwap: z.boolean().default(false),
  immediateDeed: z.boolean().default(false),
  /** Formas de pago y financiación propia del desarrollista. */
  financingDetails: OptionalText(2_000),
});
export type UpdateDevelopmentDetailsInput = z.input<typeof UpdateDevelopmentDetailsInputSchema>;

export const ChangeDevelopmentStatusInputSchema = z.object({
  ...DevelopmentId,
  status: z.enum(DEVELOPMENT_STATUS_VALUES),
});
export type ChangeDevelopmentStatusInput = z.input<typeof ChangeDevelopmentStatusInputSchema>;

export const UpdateDevelopmentFeaturesInputSchema = z.object({
  ...DevelopmentId,
  featureIds: z.array(z.uuid()).max(MAX_DEVELOPMENT_FEATURES),
});
export type UpdateDevelopmentFeaturesInput = z.input<typeof UpdateDevelopmentFeaturesInputSchema>;

export const ChangeDevelopmentTagsInputSchema = z.object({
  ...DevelopmentId,
  tagIds: z.array(z.uuid()).max(MAX_DEVELOPMENT_TAGS),
});
export type ChangeDevelopmentTagsInput = z.input<typeof ChangeDevelopmentTagsInputSchema>;

// ---------- Unidades ----------

/**
 * Alta de una unidad desde el emprendimiento: hereda la dirección, la ubicación, las coordenadas,
 * los servicios y amenities, el captador y la sucursal. Se cargan tipología, piso, unidad y precio.
 */
export const CreateDevelopmentUnitInputSchema = z.object({
  ...DevelopmentId,
  propertyType: z.enum(PROPERTY_TYPES),
  operation: z.enum(OPERATIONS),
  currency: z.enum(CURRENCIES),
  price: AmountSchema.optional(),
  floor: OptionalText(10),
  unit: OptionalText(10),
  rooms: z.coerce.number().int('Ingresá un número entero.').min(0).max(999).optional(),
  surfaceTotalM2: z.coerce.number().min(0).max(10_000_000).optional(),
  surfaceCoveredM2: z.coerce.number().min(0).max(10_000_000).optional(),
});
export type CreateDevelopmentUnitInput = z.input<typeof CreateDevelopmentUnitInputSchema>;

// ---------- Listado ----------

export const DEVELOPMENT_SORT_FIELDS = ['updatedAt', 'name', 'deliveryDate', 'code'] as const;
export type DevelopmentSortField = (typeof DEVELOPMENT_SORT_FIELDS)[number];

/** `trash`: la papelera. */
export const DEVELOPMENT_VIEW_VALUES = ['active', 'trash'] as const;
export type DevelopmentViewValue = (typeof DEVELOPMENT_VIEW_VALUES)[number];

export const ListDevelopmentsQuerySchema = pageQuerySchema({
  sortable: DEVELOPMENT_SORT_FIELDS,
  defaultSort: { field: 'updatedAt', direction: 'desc' },
}).extend({
  /** Código, nombre, dirección o desarrollista, sin distinguir mayúsculas ni acentos. */
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(DEVELOPMENT_STATUS_VALUES).optional(),
  developmentType: z.enum(DEVELOPMENT_TYPES).optional(),
  constructionStatus: z.enum(CONSTRUCTION_STATUS_VALUES).optional(),
  tagId: z.uuid().optional(),
  view: z.enum(DEVELOPMENT_VIEW_VALUES).default('active'),
});
export type ListDevelopmentsQuery = z.input<typeof ListDevelopmentsQuerySchema>;

export interface DevelopmentUserRef {
  readonly id: string;
  /** `undefined` si el usuario ya no está activo. */
  readonly name: string | undefined;
}

export interface DevelopmentTagRef {
  readonly id: string;
  readonly name: string;
}

/** Fila del listado de emprendimientos. */
export interface DevelopmentRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly developmentType: DevelopmentType | undefined;
  readonly status: DevelopmentStatusValue;
  readonly constructionStatus: ConstructionStatusValue | undefined;
  readonly publishAddress: string | undefined;
  readonly deliveryDate: string | undefined;
  readonly websiteUrl: string | undefined;
  readonly tags: readonly DevelopmentTagRef[];
  /** Unidades activas (fuera de la papelera). */
  readonly unitCount: number;
  readonly updatedAt: Date;
  /** Solo en la papelera. */
  readonly deletedAt: Date | undefined;
  readonly deletedBy: DevelopmentUserRef | undefined;
}

// ---------- Ficha (lectura) ----------

export interface DevelopmentDetail {
  readonly id: string;
  readonly code: string;
  readonly slug: string;
  readonly name: string;
  readonly developmentType: DevelopmentType | undefined;
  readonly status: DevelopmentStatusValue;
  readonly constructionStatus: ConstructionStatusValue | undefined;
  readonly deliveryDate: string | undefined;
  readonly privateAddress: string;
  readonly publishAddress: string;
  readonly portalTitle: string;
  readonly locationId: string | undefined;
  readonly locationPath: readonly {
    readonly id: string;
    readonly name: string;
    readonly kind: string;
  }[];
  readonly coordinates: { readonly latitude: number; readonly longitude: number } | undefined;
  readonly developerName: string | undefined;
  readonly commercialContact:
    { readonly id: string; readonly name: string | undefined } | undefined;
  readonly websiteUrl: string | undefined;
  readonly description: string;
  readonly financingDetails: string | undefined;
  readonly isFinanced: boolean;
  readonly acceptsSwap: boolean;
  readonly immediateDeed: boolean;
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
  readonly producer: DevelopmentUserRef | undefined;
  /** Sucursal del captador: para las reglas de pertenencia de la UI. */
  readonly branchId: string | undefined;
  readonly unitCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | undefined;
}

/** Lo que una unidad muestra de su emprendimiento (link en la ficha de la propiedad). */
export interface DevelopmentRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

// ---------- Historial ----------

export const DEVELOPMENT_HISTORY_CATEGORY_VALUES = [
  'fields',
  'status',
  'units',
  'assignments',
] as const;
export type DevelopmentHistoryCategory = (typeof DEVELOPMENT_HISTORY_CATEGORY_VALUES)[number];

export const ListDevelopmentHistoryQuerySchema = historyQuerySchema().extend({
  ...DevelopmentId,
  category: z.enum(DEVELOPMENT_HISTORY_CATEGORY_VALUES).optional(),
});
export type ListDevelopmentHistoryQuery = z.input<typeof ListDevelopmentHistoryQuerySchema>;
