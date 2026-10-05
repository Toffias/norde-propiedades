// Carga propiedades de prueba (datos del MVP APZ-WP-BOT), un usuario del panel por rol y consultas
// de portales y de la web en la base de DESARROLLO LOCAL. Idempotente: actualiza las propiedades
// por código interno, y no toca los usuarios ni las consultas que ya existen. Se niega a correr con
// NODE_ENV=production.
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

const SeedInquirySchema = z.object({
  channel: z.enum(['web_form', 'mercadolibre', 'zonaprop', 'argenprop']),
  externalId: z.string().min(1),
  hoursAgo: z.number().int().nonnegative(),
  name: z.string().min(1),
  email: z.email().nullable(),
  /** E.164. */
  phone: z
    .string()
    .regex(/^\+\d{8,15}$/)
    .nullable(),
  message: z.string().min(1),
  propertyCode: z.string().nullable(),
  deleted: z.boolean(),
});

/**
 * Las consultas de prueba, pendientes (o borradas), con las etiquetas automáticas de la propiedad
 * consultada como las arma el dominio (`inquiryAutoTags`).
 */
async function seedInquiries(client: pg.Client): Promise<number> {
  const inquiries = z
    .array(SeedInquirySchema)
    .parse(JSON.parse(readFileSync(path.join(import.meta.dirname, 'seed/inquiries.json'), 'utf8')));
  let created = 0;
  for (const inquiry of inquiries) {
    const saved = await client.query(
      `insert into core.inquiries (
         id, channel, external_id, received_at, sender_name, sender_email, sender_phone_e164,
         sender_phone_match_key, message, property_id, branch_id, status, auto_tags, created_at,
         updated_at, created_by, updated_by, deleted_at, deleted_by)
       select $1, $2::text, $3, now() - make_interval(hours => $4), $5, $6, $7::text,
         -- La clave de deduplicación de Phone: el celular argentino sin el 9.
         case when $7 like '+549%' then '+54' || substr($7, 5) else $7 end, $8,
         p.id, p.branch_id, case when $9 then 'deleted' else 'pending' end,
         array_remove(array[
           'channel:' || $2::text,
           'operation:' || p.operation,
           'type:' || p.property_type,
           'neighborhood:' || nullif(p.neighborhood, '')
         ], null),
         now(), now(), 'system:import', 'system:import',
         case when $9 then now() end, case when $9 then 'system:import' end
       from (select 1) one
       left join core.properties p on p.code = $10
       on conflict (channel, external_id) where external_id is not null do nothing`,
      [
        randomUUID(),
        inquiry.channel,
        inquiry.externalId,
        inquiry.hoursAgo,
        inquiry.name,
        inquiry.email,
        inquiry.phone,
        inquiry.message,
        inquiry.deleted,
        inquiry.propertyCode,
      ],
    );
    created += saved.rowCount ?? 0;
  }
  return created;
}

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

/**
 * Amenities por nombre del catálogo (`features`; los que no están en el catálogo se ignoran) y
 * fotos como links externos, sin archivo en el storage: la web las muestra por su URL.
 */
async function seedFeaturesAndPhotos(
  client: pg.Client,
  propertyId: string,
  p: z.infer<typeof SeedPropertySchema>,
): Promise<void> {
  await client.query(
    `insert into core.property_features (property_id, feature_id, created_at, created_by)
     select $1, f.id, now(), 'system:import'
       from core.features f
      where core.search_normalize(f.name) = any (
        select core.search_normalize(name) from unnest($2::text[]) as a(name))
     on conflict do nothing`,
    [propertyId, p.amenities],
  );
  await client.query(
    `delete from core.media_items where property_id = $1 and storage_key is null and kind = 'photo'`,
    [propertyId],
  );
  for (const [position, url] of p.imageUrls.entries()) {
    await client.query(
      `insert into core.media_items (
         id, property_id, kind, url, position, is_cover, uploaded_by, created_at, updated_at,
         created_by, updated_by)
       values ($1, $2, 'photo', $3, $4,
         -- Portada la primera, salvo que ya tenga una subida desde el panel.
         $5 and not exists (
           select 1 from core.media_items where property_id = $2 and is_cover),
         'system:import', now(), now(), 'system:import', 'system:import')`,
      [randomUUID(), propertyId, url, position, position === 0],
    );
  }
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
      const saved = await client.query<{ id: string }>(
        `insert into core.properties (
           id, code, slug, title, description, operation, property_type, status, published_on_web,
           featured, address, show_exact_address, neighborhood, city, province, price_cents, currency,
           expenses_cents, rooms, bedrooms, bathrooms, surface_total_m2, surface_covered_m2,
           created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,now(),now())
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
           surface_covered_m2 = excluded.surface_covered_m2, updated_at = now()
         returning id`,
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
        ].map((value) => (typeof value === 'bigint' ? value.toString() : value)),
      );
      // El panel, la web y el agente leen la operación y el precio de `property_operations`.
      const propertyId = saved.rows[0]?.id;
      if (propertyId === undefined) throw new Error(`No se guardó la propiedad ${p.code}`);
      await client.query(
        `insert into core.property_operations (
           id, property_id, operation, price_cents, currency, created_at, updated_at, created_by,
           updated_by)
         values ($1, $2, $3, $4, $5, now(), now(), 'system:import', 'system:import')
         on conflict (property_id, operation) do update set
           price_cents = excluded.price_cents, currency = excluded.currency, updated_at = now()`,
        [
          randomUUID(),
          propertyId,
          p.operation,
          p.price === null ? null : (BigInt(p.price) * 100n).toString(),
          p.currency,
        ],
      );
      await seedFeaturesAndPhotos(client, propertyId, p);
    }
    const users = z
      .array(NewUserSchema)
      .parse(JSON.parse(readFileSync(path.join(import.meta.dirname, 'seed/users.json'), 'utf8')));
    let created = 0;
    for (const user of users) {
      if ((await createUser(client, user)) !== undefined) created += 1;
    }
    const inquiries = await seedInquiries(client);
    await client.query('commit');
    console.log(
      `✓ ${seed.length} propiedades, ${created} usuarios y ${inquiries} consultas nuevos de prueba cargados en ${parseDatabaseUrl(url).redacted}`,
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
