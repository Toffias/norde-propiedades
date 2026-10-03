import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { coreSchema } from './core-schema';

/**
 * Outbox de eventos de dominio: se escriben en la misma transacción que el cambio y un relay
 * los publica en pg-boss. Así no se pierde un evento si el proceso se cae.
 */
export const outbox = coreSchema.table(
  'outbox',
  {
    id: uuid('id').primaryKey(),
    eventType: text('event_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    payload: jsonb('payload').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (t) => [
    index('outbox_pending_idx')
      .on(t.recordedAt)
      .where(sql`published_at is null`),
  ],
);

/**
 * Trazabilidad: quién hizo qué, cuándo y sobre qué entidad, con el diff (módulo audit).
 * Solo de inserción: el puerto `AuditLog` no tiene cómo actualizar ni borrar. La única excepción
 * es la supresión de datos de un cliente (ADR 0015).
 */
export const auditLog = coreSchema.table(
  'audit_log',
  {
    id: uuid('id').primaryKey(),
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    /** `{ campo: { before, after } }`, con valores crudos (centavos, IDs, fechas ISO). */
    changes: jsonb('changes'),
    /** Desde dónde: `gestion`, `agent`, `web`, `scheduler`, `import`. */
    source: text('source'),
    /** Agrupa las entradas de un mismo command o request. */
    correlationId: text('correlation_id'),
    /** Clientes cuyos datos aparecen en la entrada: es lo que permite la supresión. */
    clientIds: uuid('client_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    /** Solo en acciones de usuarios (login, exportaciones). */
    ip: text('ip'),
    userAgent: text('user_agent'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('audit_log_entity_idx').on(t.entityType, t.entityId, t.occurredAt),
    index('audit_log_occurred_idx').on(t.occurredAt),
    // Noticias: feed por tipo de entidad.
    index('audit_log_entity_type_occurred_idx').on(t.entityType, t.occurredAt.desc()),
    index('audit_log_client_ids_idx').using('gin', t.clientIds),
    index('audit_log_correlation_idx')
      .on(t.correlationId)
      .where(sql`correlation_id is not null`),
  ],
);

/** Constancia de una supresión de datos, sin datos personales (Ley 25.326). */
export const erasureRecords = coreSchema.table(
  'erasure_records',
  {
    id: uuid('id').primaryKey(),
    erasedEntityType: text('erased_entity_type').notNull(),
    erasedEntityId: uuid('erased_entity_id').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
    executedBy: text('executed_by').notNull(),
    executedAt: timestamp('executed_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('erasure_records_executed_idx').on(t.executedAt),
    index('erasure_records_entity_idx').on(t.erasedEntityType, t.erasedEntityId),
  ],
);

/** Corridas de importación (API de Tokko, planillas de clientes y unidades). */
export const importJobs = coreSchema.table(
  'import_jobs',
  {
    id: uuid('id').primaryKey(),
    /** `tokko_api` / `clients_xlsx` / `units_xlsx`. */
    kind: text('kind').notNull(),
    /** `pending` / `running` / `done` / `failed`. */
    status: text('status').notNull().default('pending'),
    dryRun: boolean('dry_run').notNull().default(false),
    /** Archivo subido (planillas). */
    storageKey: text('storage_key'),
    /** Nombre del archivo tal como se subió, para el historial. */
    fileName: text('file_name'),
    /**
     * Cómo se lee el archivo: el mapeo de columnas y el agente a cargo (`clients_xlsx`), o el
     * emprendimiento (`units_xlsx`).
     */
    options: jsonb('options')
      .notNull()
      .default(sql`'{}'::jsonb`),
    totals: jsonb('totals')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Por qué falló entera (`unreadable_file`, `file_missing`…). */
    failure: text('failure'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by').notNull(),
  },
  (t) => [
    index('import_jobs_kind_created_idx').on(t.kind, t.createdAt),
    /** Las importaciones de unidades de un emprendimiento, las más recientes primero. */
    index('import_jobs_units_development_idx')
      .on(sql`(${t.options} ->> 'developmentId')`, t.createdAt)
      .where(sql`${t.kind} = 'units_xlsx'`),
  ],
);

export const importJobErrors = coreSchema.table(
  'import_job_errors',
  {
    id: uuid('id').primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => importJobs.id, { onDelete: 'cascade' }),
    rowNumber: integer('row_number'),
    entityType: text('entity_type'),
    /** Qué pasó con la fila (`duplicate`, `invalid_phone`…), sin datos personales. */
    message: text('message').notNull(),
    /** Fila original, sin datos personales en claro. */
    raw: jsonb('raw'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('import_job_errors_job_row_idx').on(t.jobId, t.rowNumber)],
);

/** Equivalencia entre IDs externos (Tokko) e internos: idempotencia de las corridas. */
export const importMappings = coreSchema.table(
  'import_mappings',
  {
    id: uuid('id').primaryKey(),
    /** `tokko`. */
    source: text('source').notNull(),
    entityType: text('entity_type').notNull(),
    externalId: text('external_id').notNull(),
    internalId: uuid('internal_id').notNull(),
    /** El cliente pidió la supresión: la importación no lo vuelve a crear. */
    erasedAt: timestamp('erased_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('import_mappings_external_uq').on(t.source, t.entityType, t.externalId),
    index('import_mappings_internal_idx').on(t.entityType, t.internalId),
  ],
);
