import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  numeric,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { coreSchema } from './core-schema';

export const properties = coreSchema.table(
  'properties',
  {
    id: uuid('id').primaryKey(),
    /** Código interno visible para el equipo (ej. `P-001`). */
    code: text('code').notNull().unique(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    operation: text('operation').notNull(),
    propertyType: text('property_type').notNull(),
    status: text('status').notNull(),
    publishedOnWeb: boolean('published_on_web').notNull().default(false),
    featured: boolean('featured').notNull().default(false),
    address: text('address'),
    showExactAddress: boolean('show_exact_address').notNull().default(false),
    neighborhood: text('neighborhood').notNull(),
    city: text('city').notNull(),
    province: text('province').notNull(),
    /** Centavos. `null`: precio a consultar. */
    priceCents: bigint('price_cents', { mode: 'bigint' }),
    currency: text('currency').notNull(),
    /** Centavos de pesos. */
    expensesCents: bigint('expenses_cents', { mode: 'bigint' }),
    rooms: integer('rooms'),
    bedrooms: integer('bedrooms'),
    bathrooms: integer('bathrooms'),
    surfaceTotalM2: numeric('surface_total_m2', { precision: 10, scale: 2, mode: 'number' }),
    surfaceCoveredM2: numeric('surface_covered_m2', { precision: 10, scale: 2, mode: 'number' }),
    amenities: text('amenities')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    imageUrls: text('image_urls')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    // Búsqueda del agente y de la web: siempre filtran por estado y publicación.
    index('properties_listing_idx').on(t.status, t.publishedOnWeb, t.operation, t.propertyType),
    index('properties_price_idx').on(t.currency, t.priceCents),
  ],
);
