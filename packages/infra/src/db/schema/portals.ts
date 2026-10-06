import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { authorship, bytea, timestamps } from './columns';
import { coreSchema } from './core-schema';

/** Cuenta de Norde en cada portal. */
export const portalAccounts = coreSchema.table('portal_accounts', {
  /** `mercadolibre`, `zonaprop`, `argenprop`, … */
  portal: text('portal').primaryKey(),
  isEnabled: boolean('is_enabled').notNull().default(false),
  isPaid: boolean('is_paid').notNull().default(false),
  /** Tokens OAuth cifrados con una clave del `env.ts`. Nunca en claro. */
  credentialsEncrypted: bytea('credentials_encrypted'),
  settings: jsonb('settings')
    .notNull()
    .default(sql`'{}'::jsonb`),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  connectedBy: text('connected_by'),
  ...timestamps(),
  ...authorship(),
});

/** Publicación de una propiedad o un emprendimiento en un portal. */
export const portalListings = coreSchema.table(
  'portal_listings',
  {
    id: uuid('id').primaryKey(),
    portal: text('portal')
      .notNull()
      .references(() => portalAccounts.portal, { onDelete: 'restrict' }),
    /** Propiedad del módulo properties: solo el ID, sin foreign key entre módulos. */
    propertyId: uuid('property_id'),
    /** Emprendimiento del módulo properties: solo el ID, sin foreign key entre módulos. */
    developmentId: uuid('development_id'),
    /**
     * `sale` / `rent` / `temporary_rent`: un aviso por operación (son categorías distintas del
     * portal). Vacío en los emprendimientos.
     */
    operation: text('operation'),
    externalId: text('external_id'),
    permalink: text('permalink'),
    /** `simple` / `featured`. */
    listingType: text('listing_type').notNull().default('simple'),
    /** `pending` / `published` / `paused` / `error` / `unpublished`: cómo quedó en el portal. */
    status: text('status').notNull().default('pending'),
    /** `active` / `paused` / `closed`: lo que se pidió. */
    intent: text('intent').notNull().default('active'),
    /** Huella de lo último que se mandó al portal: si no cambió, no se vuelve a mandar. */
    contentHash: text('content_hash'),
    title: text('title'),
    alerts: jsonb('alerts')
      .notNull()
      .default(sql`'[]'::jsonb`),
    lastError: text('last_error'),
    retryCount: integer('retry_count').notNull().default(0),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [
    check('portal_listings_single_owner', sql`num_nonnulls(property_id, development_id) = 1`),
    // Sin operación, dos avisos de la misma propiedad esquivarían el índice único (null ≠ null).
    check('portal_listings_property_operation', sql`property_id is null or operation is not null`),
    uniqueIndex('portal_listings_portal_property_operation_uq')
      .on(t.portal, t.propertyId, t.operation)
      .where(sql`property_id is not null`),
    uniqueIndex('portal_listings_portal_development_uq')
      .on(t.portal, t.developmentId)
      .where(sql`development_id is not null`),
    uniqueIndex('portal_listings_portal_external_uq')
      .on(t.portal, t.externalId)
      .where(sql`external_id is not null`),
    index('portal_listings_portal_status_idx').on(t.portal, t.status),
    index('portal_listings_property_idx').on(t.propertyId),
    index('portal_listings_development_idx').on(t.developmentId),
  ],
);

export const portalListingDailyStats = coreSchema.table(
  'portal_listing_daily_stats',
  {
    listingId: uuid('listing_id')
      .notNull()
      .references(() => portalListings.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    views: integer('views').notNull().default(0),
    contacts: integer('contacts').notNull().default(0),
    favorites: integer('favorites').notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.listingId, t.date] }),
    index('portal_listing_daily_stats_date_idx').on(t.date),
  ],
);
