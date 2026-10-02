import { sql, type AnyColumn, type SQL } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
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

/**
 * Inicial del nombre para la agenda A–Z: minúscula y sin acentos (la "Á" va con la "a", la "ñ"
 * con la "n"). Lo que no es una letra de la "a" a la "z" (números, sin nombre) va en "#".
 */
export function clientInitial(name: SQL | AnyColumn): SQL {
  return sql`left(core.search_normalize(coalesce(${name}, '')), 1)`;
}

export const clients = coreSchema.table(
  'clients',
  {
    id: uuid('id').primaryKey(),
    name: text('name'),
    /** Teléfono principal. Junto con `email`, es la base de la deduplicación. */
    phoneE164: text('phone_e164'),
    /** `Phone.matchKey`: el mismo celular con o sin el 9 da la misma clave. */
    phoneMatchKey: text('phone_match_key'),
    /** Email principal. */
    email: text('email'),
    /** `person` / `company` / `group`. */
    kind: text('kind').notNull().default('person'),
    /** Tipos de cliente (propietario, comprador, inquilino…), validados en el dominio. */
    clientTypes: text('client_types')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Usuario del módulo identity: solo el ID, sin foreign key entre módulos. */
    agentId: uuid('agent_id'),
    /** Sucursal del módulo identity: solo el ID, sin foreign key entre módulos. */
    branchId: uuid('branch_id'),
    companyName: text('company_name'),
    jobTitle: text('job_title'),
    website: text('website'),
    birthDate: date('birth_date', { mode: 'string' }),
    address: text('address'),
    country: text('country'),
    language: text('language'),
    documentType: text('document_type'),
    documentNumber: text('document_number'),
    searchText: searchText('name', 'email', 'phone_e164', 'company_name', 'document_number'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    /** Nullable hasta el backfill (expand): la `0000` no la tenía. */
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    ...trash(),
    /**
     * Se unificó con otro contacto: queda vacío en la papelera, apuntando al que lo absorbió (sin
     * foreign key: es el mismo módulo, pero el principal también puede unificarse después).
     */
    mergedIntoId: uuid('merged_into_id'),
  },
  (t) => [
    // La deduplicación también la garantiza la base (dos procesos pueden registrar a la vez).
    uniqueIndex('clients_phone_match_key_uq')
      .on(t.phoneMatchKey)
      .where(sql`phone_match_key is not null`),
    uniqueIndex('clients_email_uq')
      .on(t.email)
      .where(sql`email is not null`),
    index('clients_agent_updated_idx').on(t.agentId, t.updatedAt).where(notDeleted),
    index('clients_kind_name_idx').on(t.kind, t.name).where(notDeleted),
    // Índice alfabético de la grilla (conteo y página por letra).
    index('clients_name_lower_idx')
      .on(sql`lower(${t.name})`)
      .where(notDeleted),
    // Agenda A–Z: conteo por inicial (sin acentos) y página de cada letra por nombre.
    index('clients_initial_name_idx')
      .on(clientInitial(t.name), sql`lower(${t.name})`, t.id)
      .where(notDeleted),
    index('clients_created_idx').on(t.createdAt).where(notDeleted),
    index('clients_updated_idx').on(t.updatedAt).where(notDeleted),
    index('clients_branch_idx').on(t.branchId).where(notDeleted),
    index('clients_client_types_idx').using('gin', t.clientTypes),
    index('clients_search_text_idx').using('gin', t.searchText.op('gin_trgm_ops')),
    // Papelera: listado de borrados por fecha.
    index('clients_deleted_idx')
      .on(t.deletedAt)
      .where(sql`deleted_at is not null`),
    // Supresión: los duplicados unificados en un contacto se suprimen con él.
    index('clients_merged_into_idx')
      .on(t.mergedIntoId)
      .where(sql`merged_into_id is not null`),
  ],
);

export const clientChannels = coreSchema.table(
  'client_channels',
  {
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    externalId: text('external_id').notNull(),
    firstContactAt: timestamp('first_contact_at', { withTimezone: true }).notNull(),
    lastContactAt: timestamp('last_contact_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.clientId, t.channel, t.externalId] }),
    index('client_channels_identity_idx').on(t.channel, t.externalId),
  ],
);

/**
 * Todos los teléfonos del cliente, en orden. El primero (el principal) se copia en
 * `clients.phone_e164`, que tiene el índice único de la deduplicación.
 */
export const clientPhones = coreSchema.table(
  'client_phones',
  {
    id: uuid('id').primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    /** `main` / `mobile` / `work` / `other`. */
    kind: text('kind').notNull(),
    phoneE164: text('phone_e164').notNull(),
    /** `Phone.matchKey`: deduplicación contra todos los teléfonos, no solo el principal. */
    phoneMatchKey: text('phone_match_key').notNull(),
    contactHours: text('contact_hours'),
    position: integer('position').notNull().default(0),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [
    index('client_phones_client_idx').on(t.clientId, t.position),
    index('client_phones_match_key_idx').on(t.phoneMatchKey),
  ],
);

/** Todos los emails del cliente; el primero se copia en `clients.email`. */
export const clientEmails = coreSchema.table(
  'client_emails',
  {
    id: uuid('id').primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    /** `main` / `work` / `other`. */
    kind: text('kind').notNull(),
    email: text('email').notNull(),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [
    index('client_emails_client_idx').on(t.clientId),
    index('client_emails_email_idx').on(sql`lower(${t.email})`),
  ],
);

/** Relaciones entre clientes: trabaja en, es miembro de, relacionado. */
export const clientRelations = coreSchema.table(
  'client_relations',
  {
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    relatedClientId: uuid('related_client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    /** `works_at` / `member_of` / `related`. */
    kind: text('kind').notNull(),
    label: text('label'),
    ...linkAuthorship(),
  },
  (t) => [
    primaryKey({ columns: [t.clientId, t.relatedClientId, t.kind] }),
    index('client_relations_related_idx').on(t.relatedClientId),
  ],
);

export const clientTagGroups = coreSchema.table(
  'client_tag_groups',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [
    index('client_tag_groups_position_idx').on(t.position, t.id),
    index('client_tag_groups_name_idx').on(t.name, t.id),
    index('client_tag_groups_name_trgm_idx').using(
      'gin',
      sql`core.search_normalize(${t.name}) gin_trgm_ops`,
    ),
  ],
);

export const clientTags = coreSchema.table(
  'client_tags',
  {
    id: uuid('id').primaryKey(),
    groupId: uuid('group_id').references(() => clientTagGroups.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    color: text('color'),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [
    uniqueIndex('client_tags_group_name_uq').on(
      sql`coalesce(${t.groupId}, ${NIL_UUID})`,
      sql`lower(${t.name})`,
    ),
    // Filtro por grupo y contador de etiquetas de cada grupo.
    index('client_tags_group_idx').on(t.groupId, t.name),
    index('client_tags_name_idx').on(t.name, t.id),
    index('client_tags_name_trgm_idx').using(
      'gin',
      sql`core.search_normalize(${t.name}) gin_trgm_ops`,
    ),
  ],
);

export const clientTagAssignments = coreSchema.table(
  'client_tag_assignments',
  {
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => clientTags.id, { onDelete: 'restrict' }),
    ...linkAuthorship(),
  },
  (t) => [
    primaryKey({ columns: [t.clientId, t.tagId] }),
    // Filtro por etiqueta y contador de clientes por etiqueta.
    index('client_tag_assignments_tag_idx').on(t.tagId),
  ],
);

/** Estados de oportunidad editables, cada uno con una categoría fija del dominio (ADR 0013). */
export const opportunityStages = coreSchema.table(
  'opportunity_stages',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    color: text('color').notNull(),
    position: integer('position').notNull().default(0),
    /** Un `OpportunityStatus` (`new`, `contacted`, …). Las reglas y los reportes usan esto. */
    category: text('category').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [index('opportunity_stages_category_position_idx').on(t.category, t.position)],
);

export const opportunityCloseReasons = coreSchema.table(
  'opportunity_close_reasons',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    /** `positive` / `negative` / `neutral`. */
    rating: text('rating').notNull(),
    position: integer('position').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [index('opportunity_close_reasons_position_idx').on(t.position)],
);

export const opportunities = coreSchema.table(
  'opportunities',
  {
    id: uuid('id').primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    originChannel: text('origin_channel').notNull(),
    type: text('type').notNull(),
    intent: text('intent').notNull(),
    /** Categoría del estado (ADR 0013): se mantiene igual a la de `stage_id`. */
    status: text('status').notNull(),
    /** Nullable hasta el backfill de los estados editables. */
    stageId: uuid('stage_id').references(() => opportunityStages.id, { onDelete: 'restrict' }),
    /** Propiedad del módulo properties: solo el ID, sin foreign key entre módulos. */
    propertyId: uuid('property_id'),
    /** Emprendimiento del módulo properties: solo el ID, sin foreign key entre módulos. */
    developmentId: uuid('development_id'),
    /** Usuario del módulo identity: solo el ID, sin foreign key entre módulos. */
    agentId: uuid('agent_id'),
    /** Sucursal del módulo identity: solo el ID, sin foreign key entre módulos. */
    branchId: uuid('branch_id'),
    search: jsonb('search'),
    /** Se reemplaza por `client_activities` (columna a retirar en la migración contract). */
    notes: jsonb('notes')
      .notNull()
      .default(sql`'[]'::jsonb`),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closeReasonId: uuid('close_reason_id').references(() => opportunityCloseReasons.id, {
      onDelete: 'restrict',
    }),
    /** Inmobiliaria socia a la que se derivó (`referred_to_partner`). */
    partnerName: text('partner_name'),
    referredAt: timestamp('referred_at', { withTimezone: true }),
    referralResult: text('referral_result'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    /** Nullable hasta el backfill (expand): la `0000` no la tenía. */
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
  },
  (t) => [
    index('opportunities_client_status_idx').on(t.clientId, t.status),
    index('opportunities_status_created_idx').on(t.status, t.createdAt),
    index('opportunities_agent_status_updated_idx').on(t.agentId, t.status, t.updatedAt),
    index('opportunities_stage_status_changed_idx').on(t.stageId, t.statusChangedAt),
    index('opportunities_status_last_activity_idx').on(t.status, t.lastActivityAt),
    index('opportunities_property_idx').on(t.propertyId),
    index('opportunities_development_idx').on(t.developmentId),
    index('opportunities_branch_status_idx').on(t.branchId, t.status),
    index('opportunities_origin_channel_created_idx').on(t.originChannel, t.createdAt),
    // Oportunidades de la ficha del cliente, las más nuevas primero.
    index('opportunities_client_created_idx').on(t.clientId, t.createdAt.desc(), t.id.desc()),
    // Pipeline (#9): cada sección es un estado, ordenada por actualización o creación.
    index('opportunities_stage_updated_idx').on(t.stageId, t.updatedAt, t.id),
    index('opportunities_stage_created_idx').on(t.stageId, t.createdAt, t.id),
    // Contadores por estado con la visibilidad del actor y los filtros de agente, sucursal y canal.
    index('opportunities_agent_stage_idx').on(t.agentId, t.stageId),
    index('opportunities_branch_stage_idx').on(t.branchId, t.stageId),
    index('opportunities_origin_channel_stage_idx').on(t.originChannel, t.stageId),
    // Filtro por categoría.
    index('opportunities_status_updated_idx').on(t.status, t.updatedAt),
  ],
);

/** Historial de cambios de estado: vigencia y tiempo de conversión. */
export const opportunityStatusChanges = coreSchema.table(
  'opportunity_status_changes',
  {
    id: uuid('id').primaryKey(),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    fromStageId: uuid('from_stage_id'),
    toStageId: uuid('to_stage_id'),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    changedBy: text('changed_by').notNull(),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('opportunity_status_changes_opportunity_idx').on(t.opportunityId, t.changedAt),
    index('opportunity_status_changes_to_status_idx').on(t.toStatus, t.changedAt),
  ],
);

/** Estado a aplicar en cada regla automática de oportunidades (fila única). */
export const opportunitySettings = coreSchema.table(
  'opportunity_settings',
  {
    ...singletonId(),
    stageOnCreateId: uuid('stage_on_create_id').references(() => opportunityStages.id),
    stageOnAssignId: uuid('stage_on_assign_id').references(() => opportunityStages.id),
    stageOnReactivateId: uuid('stage_on_reactivate_id').references(() => opportunityStages.id),
    stageForOwnersId: uuid('stage_for_owners_id').references(() => opportunityStages.id),
    stageAfterMessageId: uuid('stage_after_message_id').references(() => opportunityStages.id),
    stageAfterLikeId: uuid('stage_after_like_id').references(() => opportunityStages.id),
    stageAfterDislikeId: uuid('stage_after_dislike_id').references(() => opportunityStages.id),
    ...timestamps(),
    ...authorship(),
  },
  () => [check('opportunity_settings_singleton', sql`id`)],
);

/** Actividad de la ficha del cliente: notas, cambios de estado, envíos, reacciones, consultas. */
export const clientActivities = coreSchema.table(
  'client_activities',
  {
    id: uuid('id').primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, {
      onDelete: 'cascade',
    }),
    /**
     * `note` / `status_change` / `listing_sent` / `listing_viewed` / `listing_reaction` /
     * `inquiry` / `message` / `merge`.
     */
    kind: text('kind').notNull(),
    /** Usuario o actor de sistema. */
    actorId: text('actor_id').notNull(),
    body: jsonb('body')
      .notNull()
      .default(sql`'{}'::jsonb`),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [
    index('client_activities_client_occurred_idx').on(t.clientId, t.occurredAt.desc()),
    index('client_activities_opportunity_occurred_idx').on(t.opportunityId, t.occurredAt.desc()),
    // Timeline de la ficha filtrado por tipo ("solo notas").
    index('client_activities_client_kind_occurred_idx').on(
      t.clientId,
      t.kind,
      t.occurredAt.desc(),
      t.id.desc(),
    ),
    // Historial de una oportunidad filtrado por tipo (el modal del tablero).
    index('client_activities_opportunity_kind_occurred_idx').on(
      t.opportunityId,
      t.kind,
      t.occurredAt.desc(),
      t.id.desc(),
    ),
  ],
);

/** Consultas entrantes (portales, web, WhatsApp) antes y después de asignarse. */
export const inquiries = coreSchema.table(
  'inquiries',
  {
    id: uuid('id').primaryKey(),
    channel: text('channel').notNull(),
    /** ID de la consulta en el canal de origen (idempotencia). */
    externalId: text('external_id'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    senderName: text('sender_name'),
    senderEmail: text('sender_email'),
    senderPhoneE164: text('sender_phone_e164'),
    senderPhoneMatchKey: text('sender_phone_match_key'),
    message: text('message'),
    /** Propiedad del módulo properties: solo el ID, sin foreign key entre módulos. */
    propertyId: uuid('property_id'),
    /** Emprendimiento del módulo properties: solo el ID, sin foreign key entre módulos. */
    developmentId: uuid('development_id'),
    /** `pending` / `assigned` / `deleted`. */
    status: text('status').notNull().default('pending'),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, {
      onDelete: 'set null',
    }),
    /** Usuario del módulo identity: solo el ID, sin foreign key entre módulos. */
    assignedAgentId: uuid('assigned_agent_id'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    assignedBy: text('assigned_by'),
    autoTags: text('auto_tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Payload original del canal, para reprocesar. */
    raw: jsonb('raw'),
    ...timestamps(),
    ...authorship(),
    ...trash(),
  },
  (t) => [
    uniqueIndex('inquiries_channel_external_uq')
      .on(t.channel, t.externalId)
      .where(sql`external_id is not null`),
    index('inquiries_status_received_idx').on(t.status, t.receivedAt).where(notDeleted),
    index('inquiries_agent_received_idx').on(t.assignedAgentId, t.receivedAt).where(notDeleted),
    index('inquiries_channel_received_idx').on(t.channel, t.receivedAt).where(notDeleted),
    index('inquiries_sender_phone_idx').on(t.senderPhoneMatchKey),
    index('inquiries_sender_email_idx').on(sql`lower(${t.senderEmail})`),
    index('inquiries_client_idx').on(t.clientId),
    index('inquiries_property_idx').on(t.propertyId),
    index('inquiries_development_idx').on(t.developmentId),
  ],
);

/** Reglas de reparto de consultas. Las condiciones se evalúan en el dominio. */
export const inquiryAssignmentRules = coreSchema.table(
  'inquiry_assignment_rules',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    position: integer('position').notNull().default(0),
    conditions: jsonb('conditions')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Estado del reparto ponderado (round robin con pesos). */
    cursor: bigint('cursor', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [index('inquiry_assignment_rules_active_position_idx').on(t.isActive, t.position)],
);

export const inquiryAssignmentRuleAgents = coreSchema.table(
  'inquiry_assignment_rule_agents',
  {
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => inquiryAssignmentRules.id, { onDelete: 'cascade' }),
    /** Usuario del módulo identity: solo el ID, sin foreign key entre módulos. */
    userId: uuid('user_id').notNull(),
    weight: integer('weight').notNull().default(1),
    ...linkAuthorship(),
  },
  (t) => [
    primaryKey({ columns: [t.ruleId, t.userId] }),
    index('inquiry_assignment_rule_agents_user_idx').on(t.userId),
  ],
);

/** Horario de atención y guardia para el reparto de consultas (fila única). */
export const inquirySettings = coreSchema.table(
  'inquiry_settings',
  {
    ...singletonId(),
    businessHours: jsonb('business_hours'),
    /** `assign` / `keep_pending` / `assign_to_on_call`. */
    offHoursPolicy: text('off_hours_policy').notNull().default('assign'),
    /** Usuario del módulo identity: solo el ID, sin foreign key entre módulos. */
    onCallUserId: uuid('on_call_user_id'),
    ...timestamps(),
    ...authorship(),
  },
  () => [check('inquiry_settings_singleton', sql`id`)],
);

/** Búsquedas guardadas de un cliente: lo que se cruza con el stock. */
export const savedSearches = coreSchema.table(
  'saved_searches',
  {
    id: uuid('id').primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, {
      onDelete: 'set null',
    }),
    name: text('name'),
    operation: text('operation').notNull(),
    propertyTypes: text('property_types')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    currency: text('currency'),
    minPriceCents: bigint('min_price_cents', { mode: 'bigint' }),
    maxPriceCents: bigint('max_price_cents', { mode: 'bigint' }),
    /** Ubicaciones del módulo properties: solo los IDs, sin foreign key entre módulos. */
    locationIds: uuid('location_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    minRooms: integer('min_rooms'),
    /** El resto de los filtros; no se filtra por SQL. */
    criteria: jsonb('criteria')
      .notNull()
      .default(sql`'{}'::jsonb`),
    autoSend: boolean('auto_send').notNull().default(false),
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
    lastMatchedAt: timestamp('last_matched_at', { withTimezone: true }),
    ...timestamps(),
    ...authorship(),
    ...trash(),
  },
  (t) => [
    index('saved_searches_client_idx').on(t.clientId),
    // Búsquedas de la ficha del cliente, las actualizadas último primero.
    index('saved_searches_client_updated_idx')
      .on(t.clientId, t.updatedAt.desc(), t.id.desc())
      .where(notDeleted),
    // Prefiltro del cruce con el stock.
    index('saved_searches_matching_idx')
      .on(t.operation, t.currency)
      .where(sql`auto_send and deleted_at is null`),
    index('saved_searches_location_ids_idx').using('gin', t.locationIds),
    index('saved_searches_updated_idx').on(t.updatedAt).where(notDeleted),
    // Interesados de una propiedad (ficha, #6): por operación, los más recientes primero.
    index('saved_searches_operation_updated_idx')
      .on(t.operation, t.updatedAt, t.id)
      .where(sql`deleted_at is null and unsubscribed_at is null`),
  ],
);

/** Propiedades destacadas para un cliente, con su reacción. */
export const featuredListings = coreSchema.table(
  'featured_listings',
  {
    id: uuid('id').primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, {
      onDelete: 'set null',
    }),
    /** Propiedad del módulo properties: solo el ID, sin foreign key entre módulos. */
    propertyId: uuid('property_id').notNull(),
    /** Coincidencia con la búsqueda, de 0 a 100. */
    matchScore: smallint('match_score'),
    autoSendUpdates: boolean('auto_send_updates').notNull().default(false),
    /** `liked` / `disliked`. */
    reaction: text('reaction'),
    reactedAt: timestamp('reacted_at', { withTimezone: true }),
    featuredBy: text('featured_by').notNull(),
    featuredAt: timestamp('featured_at', { withTimezone: true }).notNull(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [
    uniqueIndex('featured_listings_client_property_uq')
      .on(t.clientId, t.propertyId)
      .where(sql`removed_at is null`),
    index('featured_listings_property_idx').on(t.propertyId),
    index('featured_listings_client_featured_idx').on(t.clientId, t.featuredAt),
    // Destacadas vigentes de la ficha del cliente, las últimas primero.
    index('featured_listings_client_active_idx')
      .on(t.clientId, t.featuredAt.desc(), t.id.desc())
      .where(sql`removed_at is null`),
  ],
);

/** Envío de propiedades a un cliente por link (mail o WhatsApp). */
export const sharedListings = coreSchema.table(
  'shared_listings',
  {
    id: uuid('id').primaryKey(),
    /** Hash del token del link; el token en claro solo viaja en el link. */
    tokenHash: text('token_hash').notNull(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    /** `email` / `whatsapp`. */
    channel: text('channel').notNull(),
    sentBy: text('sent_by').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [
    uniqueIndex('shared_listings_token_hash_uq').on(t.tokenHash),
    index('shared_listings_client_sent_idx').on(t.clientId, t.sentAt),
  ],
);

export const sharedListingItems = coreSchema.table(
  'shared_listing_items',
  {
    sharedListingId: uuid('shared_listing_id')
      .notNull()
      .references(() => sharedListings.id, { onDelete: 'cascade' }),
    /** Propiedad del módulo properties: solo el ID, sin foreign key entre módulos. */
    propertyId: uuid('property_id').notNull(),
    position: integer('position').notNull().default(0),
    firstOpenedAt: timestamp('first_opened_at', { withTimezone: true }),
    openCount: integer('open_count').notNull().default(0),
    /** `liked` / `disliked`. */
    reaction: text('reaction'),
    reactedAt: timestamp('reacted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.sharedListingId, t.propertyId] }),
    index('shared_listing_items_property_idx').on(t.propertyId),
  ],
);

/** Respuestas rápidas (plantillas de mensaje). */
export const quickReplies = coreSchema.table(
  'quick_replies',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    subject: text('subject'),
    body: text('body').notNull(),
    automation: jsonb('automation'),
    isActive: boolean('is_active').notNull().default(true),
    position: integer('position').notNull().default(0),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [index('quick_replies_active_position_idx').on(t.isActive, t.position)],
);

/** Seguimiento automático: coincidencias nuevas y cambios en destacadas (fila única). */
export const followUpSettings = coreSchema.table(
  'follow_up_settings',
  {
    ...singletonId(),
    newMatchesEnabled: boolean('new_matches_enabled').notNull().default(false),
    newMatchesSubject: text('new_matches_subject'),
    newMatchesBody: text('new_matches_body'),
    featuredChangesEnabled: boolean('featured_changes_enabled').notNull().default(false),
    featuredChangesSubject: text('featured_changes_subject'),
    featuredChangesBody: text('featured_changes_body'),
    createSearchFromWebInquiry: boolean('create_search_from_web_inquiry').notNull().default(false),
    ...timestamps(),
    ...authorship(),
  },
  () => [check('follow_up_settings_singleton', sql`id`)],
);
