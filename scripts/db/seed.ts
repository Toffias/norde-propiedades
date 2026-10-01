// Carga propiedades de prueba (datos del MVP APZ-WP-BOT) y un usuario del panel por rol en la base
// de DESARROLLO LOCAL. Idempotente: actualiza las propiedades por código interno y no toca los
// usuarios que ya existen. Se niega a correr con NODE_ENV=production.
// Usuarios y contraseña de prueba: `seed/users.json`.
//
// Es herramienta de desarrollo: escribe directo en la tabla. Cuando exista el alta de
// propiedades en el panel, el seed va a usar ese caso de uso.

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

import pg from 'pg';
import { z } from 'zod';

import { parseDatabaseUrl } from './database-url';
import { createUser, NewUserSchema } from './users';

const ROOT = path.resolve(import.meta.dirname, '../..');

const SeedPropertySchema = z.object({
  code: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  description: z.string(),
  operation: z.enum(['sale', 'rent', 'temporary_rent']),
  propertyType: z.enum([
    'apartment',
    'house',
    'ph',
    'land',
    'office',
    'commercial',
    'garage',
    'warehouse',
  ]),
  status: z.enum(['draft', 'available', 'reserved', 'sold', 'rented', 'paused', 'withdrawn']),
  publishedOnWeb: z.boolean(),
  featured: z.boolean(),
  address: z.string().nullable(),
  showExactAddress: z.boolean(),
  neighborhood: z.string(),
  city: z.string(),
  province: z.string(),
  /** En pesos o dólares, sin centavos. */
  price: z.number().int().nonnegative().nullable(),
  currency: z.enum(['ARS', 'USD']),
  expenses: z.number().int().nonnegative().nullable(),
  rooms: z.number().int().nullable(),
  bedrooms: z.number().int().nullable(),
  bathrooms: z.number().int().nullable(),
  surfaceTotalM2: z.number().nullable(),
  surfaceCoveredM2: z.number().nullable(),
  amenities: z.array(z.string()),
  imageUrls: z.array(z.url()),
});

function databaseUrl(): string {
  const file = path.join(ROOT, 'apps/agent/.env');
  const env = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
  if (process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production') {
    throw new Error('db:seed es solo para desarrollo local.');
  }
  const url = process.env.DATABASE_URL ?? env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL en apps/agent/.env');
  return url;
}

async function main(): Promise<void> {
  const url = databaseUrl();
  const seed = z
    .array(SeedPropertySchema)
    .parse(
      JSON.parse(readFileSync(path.join(import.meta.dirname, 'seed/properties.json'), 'utf8')),
    );

  const client = new pg.Client({ connectionString: url, application_name: 'norde-seed' });
  await client.connect();
  try {
    await client.query('begin');
    for (const p of seed) {
      await client.query(
        `insert into core.properties (
           id, code, slug, title, description, operation, property_type, status, published_on_web,
           featured, address, show_exact_address, neighborhood, city, province, price_cents, currency,
           expenses_cents, rooms, bedrooms, bathrooms, surface_total_m2, surface_covered_m2,
           amenities, image_urls, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,now(),now())
         on conflict (code) do update set
           slug = excluded.slug, title = excluded.title, description = excluded.description,
           operation = excluded.operation, property_type = excluded.property_type,
           status = excluded.status, published_on_web = excluded.published_on_web,
           featured = excluded.featured, address = excluded.address,
           show_exact_address = excluded.show_exact_address, neighborhood = excluded.neighborhood,
           city = excluded.city, province = excluded.province, price_cents = excluded.price_cents,
           currency = excluded.currency, expenses_cents = excluded.expenses_cents,
           rooms = excluded.rooms, bedrooms = excluded.bedrooms, bathrooms = excluded.bathrooms,
           surface_total_m2 = excluded.surface_total_m2,
           surface_covered_m2 = excluded.surface_covered_m2, amenities = excluded.amenities,
           image_urls = excluded.image_urls, updated_at = now()`,
        [
          randomUUID(),
          p.code,
          p.slug,
          p.title,
          p.description,
          p.operation,
          p.propertyType,
          p.status,
          p.publishedOnWeb,
          p.featured,
          p.address,
          p.showExactAddress,
          p.neighborhood,
          p.city,
          p.province,
          p.price === null ? null : BigInt(p.price) * 100n,
          p.currency,
          p.expenses === null ? null : BigInt(p.expenses) * 100n,
          p.rooms,
          p.bedrooms,
          p.bathrooms,
          p.surfaceTotalM2,
          p.surfaceCoveredM2,
          p.amenities,
          p.imageUrls,
        ].map((value) => (typeof value === 'bigint' ? value.toString() : value)),
      );
    }
    const users = z
      .array(NewUserSchema)
      .parse(JSON.parse(readFileSync(path.join(import.meta.dirname, 'seed/users.json'), 'utf8')));
    let created = 0;
    for (const user of users) {
      if ((await createUser(client, user)) !== undefined) created += 1;
    }
    await client.query('commit');
    console.log(
      `✓ ${seed.length} propiedades y ${created} usuarios nuevos de prueba cargados en ${parseDatabaseUrl(url).redacted}`,
    );
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
