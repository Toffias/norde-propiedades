import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  jsonb,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { authorship, notDeleted, timestamps, trash } from './columns';
import { coreSchema } from './core-schema';

export const appraisals = coreSchema.table(
  'appraisals',
  {
    id: uuid('id').primaryKey(),
    code: text('code').notNull(),
    /** Cliente del módulo clients: solo el ID, sin foreign key entre módulos. */
    requesterClientId: uuid('requester_client_id'),
    /** Usuario del módulo identity: solo el ID, sin foreign key entre módulos. */
    appraiserUserId: uuid('appraiser_user_id'),
    /** Usuario del módulo identity: solo el ID, sin foreign key entre módulos. */
    producerUserId: uuid('producer_user_id'),
    /** Sucursal del módulo identity: solo el ID, sin foreign key entre módulos. */
    branchId: uuid('branch_id'),
    /** `manual` / `agent_ia` / `web`. */
    source: text('source').notNull().default('manual'),
    status: text('status').notNull(),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }),
    propertyType: text('property_type').notNull(),
    address: text('address'),
    /** Ubicación del módulo properties: solo el ID, sin foreign key entre módulos. */
    locationId: uuid('location_id'),
    surfaceTotalM2: numeric('surface_total_m2', { precision: 10, scale: 2, mode: 'number' }),
    surfaceCoveredM2: numeric('surface_covered_m2', { precision: 10, scale: 2, mode: 'number' }),
    rooms: integer('rooms'),
    bedrooms: integer('bedrooms'),
    bathrooms: integer('bathrooms'),
    condition: text('condition'),
    visitAt: timestamp('visit_at', { withTimezone: true }),
    saleMinCents: bigint('sale_min_cents', { mode: 'bigint' }),
    saleMaxCents: bigint('sale_max_cents', { mode: 'bigint' }),
    saleCurrency: text('sale_currency'),
    rentMinCents: bigint('rent_min_cents', { mode: 'bigint' }),
    rentMaxCents: bigint('rent_max_cents', { mode: 'bigint' }),
    rentCurrency: text('rent_currency'),
    /** Propiedades comparables usadas en la tasación; no se filtra por SQL. */
    comparables: jsonb('comparables')
      .notNull()
      .default(sql`'[]'::jsonb`),
    observations: text('observations'),
    /** Propiedad del módulo properties: solo el ID, sin foreign key entre módulos. */
    convertedPropertyId: uuid('converted_property_id'),
    ...timestamps(),
    ...authorship(),
    ...trash(),
  },
  (t) => [
    uniqueIndex('appraisals_code_uq').on(t.code),
    index('appraisals_status_created_idx').on(t.status, t.createdAt).where(notDeleted),
    index('appraisals_appraiser_status_idx').on(t.appraiserUserId, t.status),
    index('appraisals_producer_status_idx').on(t.producerUserId, t.status),
    index('appraisals_branch_status_idx').on(t.branchId, t.status),
    index('appraisals_type_status_idx').on(t.propertyType, t.status),
    index('appraisals_visit_idx').on(t.visitAt),
    index('appraisals_requester_idx').on(t.requesterClientId),
    // Una tasación se convierte en propiedad una sola vez.
    uniqueIndex('appraisals_converted_property_uq')
      .on(t.convertedPropertyId)
      .where(sql`converted_property_id is not null`),
  ],
);

export const appraisalPhotos = coreSchema.table(
  'appraisal_photos',
  {
    id: uuid('id').primaryKey(),
    appraisalId: uuid('appraisal_id')
      .notNull()
      .references(() => appraisals.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    position: integer('position').notNull().default(0),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [index('appraisal_photos_appraisal_position_idx').on(t.appraisalId, t.position)],
);
