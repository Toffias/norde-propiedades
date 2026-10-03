// Contracts de los catálogos y la configuración de propiedades (Mi empresa).

import { z } from 'zod';

import { pageQuerySchema } from '../../shared/contracts';

import { PROPERTY_TYPES } from './values';

const Name = (max: number) => z.string().trim().min(1, 'Escribí un nombre.').max(max);

// ---------- Ubicaciones ----------

export const LOCATION_KIND_VALUES = [
  'country',
  'province',
  'city',
  'neighborhood',
  'subneighborhood',
] as const;
export type LocationKindValue = (typeof LOCATION_KIND_VALUES)[number];

export const SearchLocationsQuerySchema = pageQuerySchema({
  sortable: ['name'],
  defaultSort: { field: 'name', direction: 'asc' },
}).extend({
  /** Nombre, sin distinguir mayúsculas ni acentos. */
  q: z.string().trim().min(1).max(80).optional(),
  /** Solo los hijos directos de esta ubicación. */
  parentId: z.uuid().optional(),
  kind: z.enum(LOCATION_KIND_VALUES).optional(),
  /** Solo estas ubicaciones (para mostrar las elegidas en un formulario). */
  ids: z.array(z.uuid()).max(50).optional(),
});
export type SearchLocationsQuery = z.input<typeof SearchLocationsQuerySchema>;

export const CreateLocationInputSchema = z.object({
  /** Sin padre: un país. */
  parentId: z.uuid().optional(),
  name: Name(80),
});
export type CreateLocationInput = z.input<typeof CreateLocationInputSchema>;

export const RenameLocationInputSchema = z.object({
  locationId: z.uuid(),
  name: Name(80),
});
export type RenameLocationInput = z.input<typeof RenameLocationInputSchema>;

export interface LocationRow {
  readonly id: string;
  readonly kind: LocationKindValue;
  readonly name: string;
  readonly parentId: string | undefined;
  /** Nombres de los ancestros, de la raíz al padre ("Argentina", "CABA", "CABA"). */
  readonly ancestors: readonly string[];
}

// ---------- Servicios, ambientes y adicionales ----------

export const FEATURE_KIND_VALUES = ['service', 'room', 'amenity'] as const;
export type FeatureKindValue = (typeof FEATURE_KIND_VALUES)[number];

export const FEATURE_STATE_VALUES = ['all', 'active', 'inactive'] as const;

export const ListFeaturesQuerySchema = pageQuerySchema({
  sortable: ['position', 'name'],
  defaultSort: { field: 'position', direction: 'asc' },
}).extend({
  kind: z.enum(FEATURE_KIND_VALUES).default('service'),
  q: z.string().trim().min(1).max(60).optional(),
  state: z.enum(FEATURE_STATE_VALUES).default('all'),
});
export type ListFeaturesQuery = z.input<typeof ListFeaturesQuerySchema>;

export const CreateFeatureInputSchema = z.object({
  kind: z.enum(FEATURE_KIND_VALUES),
  name: Name(60),
});
export type CreateFeatureInput = z.input<typeof CreateFeatureInputSchema>;

export const UpdateFeatureInputSchema = z.object({
  featureId: z.uuid(),
  name: Name(60),
  isActive: z.boolean(),
});
export type UpdateFeatureInput = z.input<typeof UpdateFeatureInputSchema>;

export interface FeatureRow {
  readonly id: string;
  readonly kind: FeatureKindValue;
  readonly key: string;
  readonly name: string;
  readonly position: number;
  readonly isActive: boolean;
}

// ---------- Etiquetas ----------

/** `none`: las etiquetas sin grupo. */
export const NO_TAG_GROUP = 'none';

export const ListTagGroupsQuerySchema = pageQuerySchema({
  sortable: ['position', 'name'],
  defaultSort: { field: 'position', direction: 'asc' },
}).extend({
  q: z.string().trim().min(1).max(60).optional(),
});
export type ListTagGroupsQuery = z.input<typeof ListTagGroupsQuerySchema>;

export const SearchTagsQuerySchema = pageQuerySchema({
  sortable: ['name'],
  defaultSort: { field: 'name', direction: 'asc' },
}).extend({
  q: z.string().trim().min(1).max(60).optional(),
  group: z.union([z.uuid(), z.literal(NO_TAG_GROUP)]).optional(),
});
export type SearchTagsQuery = z.input<typeof SearchTagsQuerySchema>;

export const CreateTagGroupInputSchema = z.object({ name: Name(60) });
export type CreateTagGroupInput = z.input<typeof CreateTagGroupInputSchema>;

export const RenameTagGroupInputSchema = z.object({ groupId: z.uuid(), name: Name(60) });
export type RenameTagGroupInput = z.input<typeof RenameTagGroupInputSchema>;

export const TagGroupIdInputSchema = z.object({ groupId: z.uuid() });
export type TagGroupIdInput = z.input<typeof TagGroupIdInputSchema>;

export const TagFieldsSchema = z.object({
  /** Sin grupo: etiqueta suelta. */
  groupId: z.uuid().optional(),
  name: Name(60),
});
export const CreateTagInputSchema = TagFieldsSchema;
export type CreateTagInput = z.input<typeof CreateTagInputSchema>;

export const UpdateTagInputSchema = TagFieldsSchema.extend({ tagId: z.uuid() });
export type UpdateTagInput = z.input<typeof UpdateTagInputSchema>;

export const TagIdInputSchema = z.object({ tagId: z.uuid() });
export type TagIdInput = z.input<typeof TagIdInputSchema>;

export interface TagGroupRow {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly tagCount: number;
}

export interface TagRow {
  readonly id: string;
  readonly name: string;
  readonly groupId: string | undefined;
  readonly groupName: string | undefined;
  /** Propiedades y emprendimientos que la tienen. */
  readonly uses: number;
}

// ---------- Tipos de propiedad y atributos ----------

export const PROPERTY_ATTRIBUTE_GROUP_VALUES = [
  'general',
  'surfaces',
  'operation',
  'catalogs',
] as const;
export type PropertyAttributeGroupValue = (typeof PROPERTY_ATTRIBUTE_GROUP_VALUES)[number];

export const PROPERTY_ATTRIBUTE_VALUES = [
  'rooms',
  'bedrooms',
  'bathrooms',
  'toilets',
  'parkingSpaces',
  'ageYears',
  'orientation',
  'condition',
  'disposition',
  'isFurnished',
  'professionalUse',
  'surfaceTotalM2',
  'surfaceCoveredM2',
  'surfaceSemiCoveredM2',
  'surfaceLandM2',
  'frontM',
  'depthM',
  'expenses',
  'creditEligible',
  'isExclusive',
  'acceptsSwap',
  'immediateDeed',
  'hasFinancing',
  'services',
  'roomFeatures',
  'amenities',
] as const;
export type PropertyAttributeValue = (typeof PROPERTY_ATTRIBUTE_VALUES)[number];

/** Grupo de cada atributo en la ficha (el mismo que el del dominio; un test lo verifica). */
export const PROPERTY_ATTRIBUTE_GROUP_OF: Readonly<
  Record<PropertyAttributeValue, PropertyAttributeGroupValue>
> = {
  rooms: 'general',
  bedrooms: 'general',
  bathrooms: 'general',
  toilets: 'general',
  parkingSpaces: 'general',
  ageYears: 'general',
  orientation: 'general',
  condition: 'general',
  disposition: 'general',
  isFurnished: 'general',
  professionalUse: 'general',
  surfaceTotalM2: 'surfaces',
  surfaceCoveredM2: 'surfaces',
  surfaceSemiCoveredM2: 'surfaces',
  surfaceLandM2: 'surfaces',
  frontM: 'surfaces',
  depthM: 'surfaces',
  expenses: 'operation',
  creditEligible: 'operation',
  isExclusive: 'operation',
  acceptsSwap: 'operation',
  immediateDeed: 'operation',
  hasFinancing: 'operation',
  services: 'catalogs',
  roomFeatures: 'catalogs',
  amenities: 'catalogs',
};

export const UpdatePropertyTypeSettingInputSchema = z.object({
  propertyType: z.enum(PROPERTY_TYPES),
  isEnabled: z.boolean(),
  visibleAttributes: z
    .array(z.enum(PROPERTY_ATTRIBUTE_VALUES))
    .max(PROPERTY_ATTRIBUTE_VALUES.length),
});
export type UpdatePropertyTypeSettingInput = z.input<typeof UpdatePropertyTypeSettingInputSchema>;

export interface PropertyTypeSettingRow {
  readonly propertyType: (typeof PROPERTY_TYPES)[number];
  readonly isEnabled: boolean;
  readonly visibleAttributes: readonly PropertyAttributeValue[];
  /** La configuración recomendada del tipo, para "Restablecer". */
  readonly recommendedAttributes: readonly PropertyAttributeValue[];
}

// ---------- Columnas de la grilla ----------

export const GRID_COLUMN_VALUES = [
  'rooms',
  'bedrooms',
  'bathrooms',
  'parkingSpaces',
  'surfaceTotalM2',
  'surfaceCoveredM2',
  'ageYears',
  'producer',
  'createdAt',
  'updatedAt',
] as const;
export type GridColumnValue = (typeof GRID_COLUMN_VALUES)[number];
export const MAX_GRID_COLUMN_COUNT = 4;

export const UpdateGridColumnsInputSchema = z.object({
  columns: z
    .array(z.enum(GRID_COLUMN_VALUES))
    .max(MAX_GRID_COLUMN_COUNT, `Elegí hasta ${MAX_GRID_COLUMN_COUNT} columnas.`),
});
export type UpdateGridColumnsInput = z.input<typeof UpdateGridColumnsInputSchema>;

// ---------- Búsquedas favoritas ----------

export const ListFavoriteSearchesQuerySchema = pageQuerySchema({
  sortable: ['name', 'updatedAt'],
  defaultSort: { field: 'name', direction: 'asc' },
});
export type ListFavoriteSearchesQuery = z.input<typeof ListFavoriteSearchesQuerySchema>;

/** Parámetros del buscador que se guardan: los filtros y el orden (no la página ni la vista). */
export const FAVORITE_SEARCH_PARAMS = [
  'q',
  'location',
  'operation',
  'propertyType',
  'status',
  'currency',
  'minPrice',
  'maxPrice',
  'scope',
  'sort',
] as const;

export const SaveFavoriteSearchInputSchema = z.object({
  name: Name(60),
  params: z.partialRecord(z.enum(FAVORITE_SEARCH_PARAMS), z.string().trim().max(100)),
});
export type SaveFavoriteSearchInput = z.input<typeof SaveFavoriteSearchInputSchema>;

export const FavoriteSearchIdInputSchema = z.object({ searchId: z.uuid() });
export type FavoriteSearchIdInput = z.input<typeof FavoriteSearchIdInputSchema>;

export interface FavoriteSearchRow {
  readonly id: string;
  readonly name: string;
  readonly params: Readonly<Record<string, string>>;
  readonly updatedAt: Date;
}
