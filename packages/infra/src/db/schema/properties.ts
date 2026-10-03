import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  authorship,
  linkAuthorship,
  notDeleted,
  searchText,
  singletonId,
  timestamps,
  trash,
  NIL_UUID,
} from './columns';
import { coreSchema } from './core-schema';

/** Ubicaciones jerárquicas: país > provincia > ciudad > barrio > sub-barrio. */
export const locations = coreSchema.table(
  'locations',
  {
    id: uuid('id').primaryKey(),
    parentId: uuid('parent_id').references((): AnyPgColumn => locations.id, {
      onDelete: 'restrict',
    }),
    /** `country` / `province` / `city` / `neighborhood` / `subneighborhood`. */
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    /** Nombre en minúsculas y sin acentos, para el buscador de ubicaciones. */
    normalizedName: text('normalized_name').notNull(),
    /** Ruta materializada de IDs (`/<país>/<provincia>/…/`), para filtrar un subárbol. */
    path: text('path').notNull(),
    latitude: numeric('latitude', { precision: 9, scale: 6, mode: 'number' }),
    longitude: numeric('longitude', { precision: 9, scale: 6, mode: 'number' }),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [
    index('locations_parent_idx').on(t.parentId),
    index('locations_path_idx').on(t.path.op('text_pattern_ops')),
    index('locations_normalized_name_idx').using('gin', t.normalizedName.op('gin_trgm_ops')),
    // Dos ubicaciones con el mismo nombre bajo el mismo padre son la misma.
    uniqueIndex('locations_parent_name_uq').on(
      sql`coalesce(${t.parentId}, ${NIL_UUID})`,
      t.normalizedName,
    ),
    // Buscador por nombre: orden alfabético estable.
    index('locations_name_idx').on(t.name, t.id),
  ],
);

export const developments = coreSchema.table(
  'developments',
  {
    id: uuid('id').primaryKey(),
    code: text('code').notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    developmentType: text('development_type'),
    /** `marketing` (comercializando) / `loading` (cargando información). */
    status: text('status').notNull().default('loading'),
    constructionStatus: text('construction_status'),
    deliveryDate: date('delivery_date', { mode: 'string' }),
    /** Dirección exacta: privada, no se publica. */
    privateAddress: text('private_address'),
    publishAddress: text('publish_address'),
    portalTitle: text('portal_title'),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'restrict' }),
    latitude: numeric('latitude', { precision: 9, scale: 6, mode: 'number' }),
    longitude: numeric('longitude', { precision: 9, scale: 6, mode: 'number' }),
    developerName: text('developer_name'),
    /** Cliente del módulo clients: solo el ID, sin foreign key entre módulos. */
    commercialContactClientId: uuid('commercial_contact_client_id'),
    websiteUrl: text('website_url'),
    description: text('description').notNull().default(''),
    financingDetails: text('financing_details'),
    isFinanced: boolean('is_financed').notNull().default(false),
    acceptsSwap: boolean('accepts_swap').notNull().default(false),
    immediateDeed: boolean('immediate_deed').notNull().default(false),
    publishedOnWeb: boolean('published_on_web').notNull().default(false),
    featured: boolean('featured').notNull().default(false),
    /** Usuario del módulo identity: solo el ID, sin foreign key entre módulos. */
    producerUserId: uuid('producer_user_id'),
    /** Sucursal del módulo identity: solo el ID, sin foreign key entre módulos. */
    branchId: uuid('branch_id'),
    searchText: searchText('code', 'name', 'publish_address', 'developer_name'),
    ...timestamps(),
    ...authorship(),
    ...trash(),
  },
  (t) => [
    uniqueIndex('developments_code_uq').on(t.code),
    uniqueIndex('developments_slug_uq').on(t.slug),
    index('developments_status_updated_idx').on(t.status, t.updatedAt).where(notDeleted),
    index('developments_name_idx').on(t.name).where(notDeleted),
    index('developments_delivery_date_idx').on(t.deliveryDate).where(notDeleted),
    index('developments_location_idx').on(t.locationId),
    index('developments_coordinates_idx').on(t.latitude, t.longitude).where(notDeleted),
    index('developments_commercial_contact_idx').on(t.commercialContactClientId),
    index('developments_search_text_idx').using('gin', t.searchText.op('gin_trgm_ops')),
    // Listado del panel (#7): orden por defecto, filtros por tipo y estado de obra, y papelera.
    index('developments_updated_idx').on(t.updatedAt, t.id).where(notDeleted),
    index('developments_type_idx').on(t.developmentType).where(notDeleted),
    index('developments_construction_status_idx').on(t.constructionStatus).where(notDeleted),
    index('developments_deleted_idx')
      .on(t.deletedAt)
      .where(sql`deleted_at is not null`),
  ],
);

export const properties = coreSchema.table(
  'properties',
  {
    id: uuid('id').primaryKey(),
    /** Código interno visible para el equipo (ej. `P-001`). */
    code: text('code').notNull().unique(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    /** Se reemplaza por `property_operations` (columna a retirar en la migración contract). */
    operation: text('operation').notNull(),
    propertyType: text('property_type').notNull(),
    status: text('status').notNull(),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }),
    publishedOnWeb: boolean('published_on_web').notNull().default(false),
    featured: boolean('featured').notNull().default(false),
    /** Unidad de un emprendimiento. */
    developmentId: uuid('development_id').references(() => developments.id, {
      onDelete: 'restrict',
    }),
    address: text('address'),
    showExactAddress: boolean('show_exact_address').notNull().default(false),
    /** Calle, número, piso y unidad: privados. La web y los portales muestran `publish_address`. */
    street: text('street'),
    streetNumber: text('street_number'),
    floor: text('floor'),
    unit: text('unit'),
    publishAddress: text('publish_address'),
    neighborhood: text('neighborhood').notNull(),
    city: text('city').notNull(),
    province: text('province').notNull(),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'restrict' }),
    latitude: numeric('latitude', { precision: 9, scale: 6, mode: 'number' }),
    longitude: numeric('longitude', { precision: 9, scale: 6, mode: 'number' }),
    portalTitle: text('portal_title'),
    /** Se reemplaza por `property_operations` (columna a retirar en la migración contract). */
    priceCents: bigint('price_cents', { mode: 'bigint' }),
    currency: text('currency').notNull(),
    /** Mostrar el precio en la web y los portales. */
    priceOnWeb: boolean('price_on_web').notNull().default(true),
    /** Centavos de pesos. */
    expensesCents: bigint('expenses_cents', { mode: 'bigint' }),
    rooms: integer('rooms'),
    bedrooms: integer('bedrooms'),
    bathrooms: integer('bathrooms'),
    toilets: integer('toilets'),
    parkingSpaces: integer('parking_spaces'),
    ageYears: integer('age_years'),
    orientation: text('orientation'),
    condition: text('condition'),
    disposition: text('disposition'),
    surfaceTotalM2: numeric('surface_total_m2', { precision: 10, scale: 2, mode: 'number' }),
    surfaceCoveredM2: numeric('surface_covered_m2', { precision: 10, scale: 2, mode: 'number' }),
    surfaceSemiCoveredM2: numeric('surface_semi_covered_m2', {
      precision: 10,
      scale: 2,
      mode: 'number',
    }),
    surfaceLandM2: numeric('surface_land_m2', { precision: 10, scale: 2, mode: 'number' }),
    frontM: numeric('front_m', { precision: 10, scale: 2, mode: 'number' }),
    depthM: numeric('depth_m', { precision: 10, scale: 2, mode: 'number' }),
    isFurnished: boolean('is_furnished').notNull().default(false),
    creditEligible: boolean('credit_eligible').notNull().default(false),
    professionalUse: boolean('professional_use').notNull().default(false),
    isExclusive: boolean('is_exclusive').notNull().default(false),
    acceptsSwap: boolean('accepts_swap').notNull().default(false),
    immediateDeed: boolean('immediate_deed').notNull().default(false),
    hasFinancing: boolean('has_financing').notNull().default(false),
    keysLocation: text('keys_location'),
    legalInfo: text('legal_info'),
    internalComments: text('internal_comments'),
    videoUrl: text('video_url'),
    tour360Url: text('tour_360_url'),
    /** Se reemplaza por `property_features` (columna a retirar en la migración contract). */
    amenities: text('amenities')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Se reemplaza por `media_items` (columna a retirar en la migración contract). */
    imageUrls: text('image_urls')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Captador. Usuario del módulo identity: solo el ID, sin foreign key entre módulos. */
    producerUserId: uuid('producer_user_id'),
    /** Sucursal del módulo identity: solo el ID, sin foreign key entre módulos. */
    branchId: uuid('branch_id'),
    /** Usuario del módulo identity: solo el ID, sin foreign key entre módulos. */
    maintenanceUserId: uuid('maintenance_user_id'),
    searchText: searchText('code', 'title', 'address', 'street', 'neighborhood', 'city'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    /** Nullable hasta el backfill (expand): la `0000` no la tenía. */
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    ...trash(),
  },
  (t) => [
    // Búsqueda del agente y de la web: siempre filtran por estado y publicación.
    index('properties_listing_idx').on(t.status, t.publishedOnWeb, t.operation, t.propertyType),
    index('properties_price_idx').on(t.currency, t.priceCents),
    // Grilla del panel.
    index('properties_status_updated_idx').on(t.status, t.updatedAt).where(notDeleted),
    index('properties_created_idx').on(t.createdAt).where(notDeleted),
    // Orden por defecto del buscador del panel, sin filtro de estado.
    index('properties_updated_idx').on(t.updatedAt).where(notDeleted),
    // Filtro de ubicación del panel: barrio, localidad o provincia, sin acentos.
    index('properties_location_text_idx').using(
      'gin',
      sql`core.search_normalize(${t.neighborhood} || ' ' || ${t.city} || ' ' || ${t.province}) gin_trgm_ops`,
    ),
    index('properties_type_status_idx').on(t.propertyType, t.status).where(notDeleted),
    index('properties_producer_status_idx').on(t.producerUserId, t.status),
    index('properties_branch_status_idx').on(t.branchId, t.status),
    index('properties_development_idx').on(t.developmentId),
    index('properties_location_idx').on(t.locationId),
    // Mapa por bounding box. Sin PostGIS alcanza al volumen actual.
    index('properties_coordinates_idx').on(t.latitude, t.longitude).where(notDeleted),
    index('properties_search_text_idx').using('gin', t.searchText.op('gin_trgm_ops')),
    index('properties_deleted_idx')
      .on(t.deletedAt)
      .where(sql`deleted_at is not null`),
  ],
);

/** Operaciones de una propiedad (venta, alquiler, temporario), cada una con su precio. */
export const propertyOperations = coreSchema.table(
  'property_operations',
  {
    id: uuid('id').primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    operation: text('operation').notNull(),
    /** Centavos. `null`: sin precio cargado. */
    priceCents: bigint('price_cents', { mode: 'bigint' }),
    currency: text('currency').notNull(),
    priceOnRequest: boolean('price_on_request').notNull().default(false),
    commissionPct: numeric('commission_pct', { precision: 5, scale: 2, mode: 'number' }),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [
    uniqueIndex('property_operations_property_operation_uq').on(t.propertyId, t.operation),
    index('property_operations_price_idx').on(t.operation, t.currency, t.priceCents),
    // Precio de cada propiedad en una moneda (filtro y orden del panel sin operación elegida).
    index('property_operations_property_currency_idx').on(t.propertyId, t.currency, t.priceCents),
  ],
);

export const propertyPriceChanges = coreSchema.table(
  'property_price_changes',
  {
    id: uuid('id').primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    operation: text('operation').notNull(),
    oldPriceCents: bigint('old_price_cents', { mode: 'bigint' }),
    newPriceCents: bigint('new_price_cents', { mode: 'bigint' }),
    currency: text('currency').notNull(),
    changedBy: text('changed_by').notNull(),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('property_price_changes_property_idx').on(t.propertyId, t.changedAt),
    // Noticias y cruce con búsquedas guardadas.
    index('property_price_changes_changed_idx').on(t.changedAt),
  ],
);

/** Qué tipos de propiedad se usan y qué atributos muestra la ficha de cada uno. */
export const propertyTypeSettings = coreSchema.table('property_type_settings', {
  /** Un valor de `PROPERTY_TYPES`. */
  propertyType: text('property_type').primaryKey(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  visibleAttributes: text('visible_attributes')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  position: integer('position').notNull().default(0),
  ...timestamps(),
  ...authorship(),
});

/** Configuración del módulo de propiedades (fila única). */
export const propertySettings = coreSchema.table(
  'property_settings',
  {
    ...singletonId(),
    gridColumns: text('grid_columns')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ...timestamps(),
    ...authorship(),
  },
  () => [check('property_settings_singleton', sql`id`)],
);

/** Catálogo de servicios, ambientes y amenities (ADR 0014). */
export const features = coreSchema.table(
  'features',
  {
    id: uuid('id').primaryKey(),
    /** `service` / `room` / `amenity`. */
    kind: text('kind').notNull(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [
    uniqueIndex('features_key_uq').on(t.key),
    index('features_kind_position_idx').on(t.kind, t.position),
    // Un nombre por tipo, sin acentos ni mayúsculas; también resuelve el buscador del catálogo.
    uniqueIndex('features_kind_name_uq').on(t.kind, sql`core.search_normalize(${t.name})`),
    index('features_kind_name_idx').on(t.kind, t.name),
    index('features_name_trgm_idx').using(
      'gin',
      sql`core.search_normalize(${t.name}) gin_trgm_ops`,
    ),
  ],
);

export const propertyFeatures = coreSchema.table(
  'property_features',
  {
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    featureId: uuid('feature_id')
      .notNull()
      .references(() => features.id, { onDelete: 'restrict' }),
    ...linkAuthorship(),
  },
  (t) => [
    primaryKey({ columns: [t.propertyId, t.featureId] }),
    index('property_features_feature_idx').on(t.featureId),
  ],
);

export const developmentFeatures = coreSchema.table(
  'development_features',
  {
    developmentId: uuid('development_id')
      .notNull()
      .references(() => developments.id, { onDelete: 'cascade' }),
    featureId: uuid('feature_id')
      .notNull()
      .references(() => features.id, { onDelete: 'restrict' }),
    ...linkAuthorship(),
  },
  (t) => [
    primaryKey({ columns: [t.developmentId, t.featureId] }),
    index('development_features_feature_idx').on(t.featureId),
  ],
);

export const propertyOwners = coreSchema.table(
  'property_owners',
  {
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    /** Cliente del módulo clients: solo el ID, sin foreign key entre módulos. */
    clientId: uuid('client_id').notNull(),
    ...linkAuthorship(),
  },
  (t) => [
    primaryKey({ columns: [t.propertyId, t.clientId] }),
    // "Propiedades de las que es propietario" y supresión del cliente.
    index('property_owners_client_idx').on(t.clientId),
  ],
);

export const propertyAppraisers = coreSchema.table(
  'property_appraisers',
  {
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    /** Usuario del módulo identity: solo el ID, sin foreign key entre módulos. */
    userId: uuid('user_id').notNull(),
    ...linkAuthorship(),
  },
  (t) => [
    primaryKey({ columns: [t.propertyId, t.userId] }),
    index('property_appraisers_user_idx').on(t.userId),
  ],
);

export const propertyTagGroups = coreSchema.table(
  'property_tag_groups',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [
    uniqueIndex('property_tag_groups_name_uq').on(sql`core.search_normalize(${t.name})`),
    index('property_tag_groups_position_idx').on(t.position, t.id),
    index('property_tag_groups_name_idx').on(t.name, t.id),
    index('property_tag_groups_name_trgm_idx').using(
      'gin',
      sql`core.search_normalize(${t.name}) gin_trgm_ops`,
    ),
  ],
);

export const propertyTags = coreSchema.table(
  'property_tags',
  {
    id: uuid('id').primaryKey(),
    groupId: uuid('group_id').references(() => propertyTagGroups.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    color: text('color'),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [
    uniqueIndex('property_tags_group_name_uq').on(
      sql`coalesce(${t.groupId}, ${NIL_UUID})`,
      sql`lower(${t.name})`,
    ),
    index('property_tags_group_idx').on(t.groupId, t.name),
    index('property_tags_name_idx').on(t.name, t.id),
    index('property_tags_name_trgm_idx').using(
      'gin',
      sql`core.search_normalize(${t.name}) gin_trgm_ops`,
    ),
  ],
);

export const propertyTagAssignments = coreSchema.table(
  'property_tag_assignments',
  {
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => propertyTags.id, { onDelete: 'restrict' }),
    ...linkAuthorship(),
  },
  (t) => [
    primaryKey({ columns: [t.propertyId, t.tagId] }),
    index('property_tag_assignments_tag_idx').on(t.tagId),
  ],
);

export const developmentTagAssignments = coreSchema.table(
  'development_tag_assignments',
  {
    developmentId: uuid('development_id')
      .notNull()
      .references(() => developments.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => propertyTags.id, { onDelete: 'restrict' }),
    ...linkAuthorship(),
  },
  (t) => [
    primaryKey({ columns: [t.developmentId, t.tagId] }),
    index('development_tag_assignments_tag_idx').on(t.tagId),
  ],
);

/**
 * Búsquedas favoritas de los usuarios del panel: filtros del buscador de propiedades con un nombre.
 * No son las búsquedas de un cliente (`saved_searches`).
 */
export const favoritePropertySearches = coreSchema.table(
  'favorite_property_searches',
  {
    id: uuid('id').primaryKey(),
    /** Usuario del módulo identity: solo el ID, sin foreign key entre módulos. */
    userId: uuid('user_id').notNull(),
    name: text('name').notNull(),
    /** Parámetros del buscador tal como van en la URL. */
    params: jsonb('params').notNull(),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [
    uniqueIndex('favorite_property_searches_user_name_uq').on(
      t.userId,
      sql`core.search_normalize(${t.name})`,
    ),
    index('favorite_property_searches_user_name_idx').on(t.userId, t.name, t.id),
    index('favorite_property_searches_user_updated_idx').on(t.userId, t.updatedAt, t.id),
  ],
);

/** Definición de los atributos personalizados de propiedad (EAV, ADR 0014). */
export const propertyCustomAttributes = coreSchema.table(
  'property_custom_attributes',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    /** `text` / `number` / `boolean` / `select`. */
    kind: text('kind').notNull(),
    /** Opciones de un atributo `select`. */
    options: jsonb('options'),
    position: integer('position').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [
    // Un nombre por atributo, sin acentos ni mayúsculas; también resuelve la búsqueda por nombre.
    uniqueIndex('property_custom_attributes_name_uq').on(sql`core.search_normalize(${t.name})`),
    index('property_custom_attributes_position_idx').on(t.position, t.id),
  ],
);

/** Valor de un atributo personalizado, en la columna de su tipo (ADR 0014). */
export const propertyCustomAttributeValues = coreSchema.table(
  'property_custom_attribute_values',
  {
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    attributeId: uuid('attribute_id')
      .notNull()
      .references(() => propertyCustomAttributes.id, { onDelete: 'restrict' }),
    valueText: text('value_text'),
    valueNumber: numeric('value_number', { precision: 14, scale: 4, mode: 'number' }),
    valueBoolean: boolean('value_boolean'),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [
    primaryKey({ columns: [t.propertyId, t.attributeId] }),
    index('property_custom_attribute_values_text_idx').on(t.attributeId, t.valueText),
  ],
);

/** Fotos, planos, videos y tours de una propiedad o de un emprendimiento. */
export const mediaItems = coreSchema.table(
  'media_items',
  {
    id: uuid('id').primaryKey(),
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'cascade' }),
    developmentId: uuid('development_id').references(() => developments.id, {
      onDelete: 'cascade',
    }),
    /** `photo` / `floor_plan` / `video` / `tour_360`. */
    kind: text('kind').notNull(),
    storageKey: text('storage_key'),
    url: text('url').notNull(),
    position: integer('position').notNull().default(0),
    isCover: boolean('is_cover').notNull().default(false),
    showOnWeb: boolean('show_on_web').notNull().default(true),
    includeInPdf: boolean('include_in_pdf').notNull().default(true),
    /** Grados: 0, 90, 180, 270. */
    rotation: smallint('rotation').notNull().default(0),
    description: text('description'),
    width: integer('width'),
    height: integer('height'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    /** Variantes generadas (miniatura, con marca de agua): clave de storage por variante. */
    variants: jsonb('variants')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Tipo de la original subida (fotos y planos). */
    contentType: text('content_type'),
    /** `pending` / `ready` / `failed`: las variantes las genera un job (ADR 0020). */
    processingStatus: text('processing_status').notNull().default('ready'),
    processingError: text('processing_error'),
    uploadedBy: text('uploaded_by').notNull(),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [
    check('media_items_single_owner', sql`num_nonnulls(property_id, development_id) = 1`),
    index('media_items_property_position_idx').on(t.propertyId, t.position),
    index('media_items_development_position_idx').on(t.developmentId, t.position),
    uniqueIndex('media_items_property_cover_uq')
      .on(t.propertyId)
      .where(sql`is_cover and property_id is not null`),
    uniqueIndex('media_items_development_cover_uq')
      .on(t.developmentId)
      .where(sql`is_cover and development_id is not null`),
  ],
);

/** Archivos adjuntos (documentación) de una propiedad o de un emprendimiento. */
export const attachments = coreSchema.table(
  'attachments',
  {
    id: uuid('id').primaryKey(),
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'cascade' }),
    developmentId: uuid('development_id').references(() => developments.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    storageKey: text('storage_key').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    showOnWeb: boolean('show_on_web').notNull().default(false),
    uploadedBy: text('uploaded_by').notNull(),
    ...timestamps(),
    ...authorship(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    check('attachments_single_owner', sql`num_nonnulls(property_id, development_id) = 1`),
    index('attachments_property_created_idx').on(t.propertyId, t.createdAt),
    // Pestaña Archivos de la ficha, ordenada por nombre.
    index('attachments_property_name_idx')
      .on(t.propertyId, t.name, t.id)
      .where(sql`deleted_at is null`),
    index('attachments_development_created_idx').on(t.developmentId, t.createdAt),
  ],
);

/** PDF pedidos desde la ficha (ficha, vidriera, reporte al propietario). Los arma un job (ADR 0020). */
export const propertyDocuments = coreSchema.table(
  'property_documents',
  {
    id: uuid('id').primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    /** `sheet` / `showcase` / `owner_report`. */
    kind: text('kind').notNull(),
    /** `pending` / `ready` / `failed`. */
    status: text('status').notNull().default('pending'),
    /** Período del reporte al propietario (días de Buenos Aires). */
    periodFrom: date('period_from', { mode: 'string' }),
    periodTo: date('period_to', { mode: 'string' }),
    storageKey: text('storage_key'),
    error: text('error'),
    requestedBy: text('requested_by').notNull(),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [index('property_documents_property_created_idx').on(t.propertyId, t.createdAt, t.id)],
);

/** Reservas de una propiedad (D3: van con la propiedad porque cambian su estado). */
export const reservations = coreSchema.table(
  'reservations',
  {
    id: uuid('id').primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'restrict' }),
    /** Cliente del módulo clients: solo el ID, sin foreign key entre módulos. */
    clientId: uuid('client_id').notNull(),
    /** Oportunidad del módulo clients: solo el ID, sin foreign key entre módulos. */
    opportunityId: uuid('opportunity_id'),
    /** Usuario del módulo identity: solo el ID, sin foreign key entre módulos. */
    agentUserId: uuid('agent_user_id'),
    /** Usuario del módulo identity: solo el ID, sin foreign key entre módulos. */
    managerUserId: uuid('manager_user_id'),
    /** Sucursal del módulo identity: solo el ID, sin foreign key entre módulos. */
    branchId: uuid('branch_id'),
    operation: text('operation').notNull(),
    amountCents: bigint('amount_cents', { mode: 'bigint' }),
    currency: text('currency'),
    /** D7: la comisión puede ser porcentaje, monto o ambos. */
    commissionPct: numeric('commission_pct', { precision: 5, scale: 2, mode: 'number' }),
    commissionCents: bigint('commission_cents', { mode: 'bigint' }),
    commissionCurrency: text('commission_currency'),
    /** `active` / `fallen` / `signed`. */
    status: text('status').notNull().default('active'),
    reservedAt: timestamp('reserved_at', { withTimezone: true }).notNull(),
    estimatedSigningDate: date('estimated_signing_date', { mode: 'string' }),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    fallenAt: timestamp('fallen_at', { withTimezone: true }),
    fallenReason: text('fallen_reason'),
    notes: text('notes'),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [
    // Una propiedad tiene a lo sumo una reserva activa.
    uniqueIndex('reservations_active_property_uq')
      .on(t.propertyId)
      .where(sql`status = 'active'`),
    index('reservations_status_signing_idx').on(t.status, t.estimatedSigningDate),
    index('reservations_agent_reserved_idx').on(t.agentUserId, t.reservedAt),
    index('reservations_manager_reserved_idx').on(t.managerUserId, t.reservedAt),
    index('reservations_branch_reserved_idx').on(t.branchId, t.reservedAt),
    index('reservations_created_idx').on(t.createdAt),
    index('reservations_client_idx').on(t.clientId),
  ],
);

/** Configuración de reservas (fila única). */
export const reservationSettings = coreSchema.table(
  'reservation_settings',
  {
    ...singletonId(),
    /** Etiqueta de cliente obligatoria para reservar (del módulo clients, solo el ID). */
    requiredClientTagId: uuid('required_client_tag_id'),
    managerRequired: boolean('manager_required').notNull().default(false),
    /** Usuarios a notificar (del módulo identity, solo los IDs). */
    notifyUserIds: uuid('notify_user_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    ...timestamps(),
    ...authorship(),
  },
  () => [check('reservation_settings_singleton', sql`id`)],
);

/** Usuarios que pueden ser gestores de una reserva. */
export const reservationManagers = coreSchema.table('reservation_managers', {
  /** Usuario del módulo identity: solo el ID, sin foreign key entre módulos. */
  userId: uuid('user_id').primaryKey(),
  ...linkAuthorship(),
});
