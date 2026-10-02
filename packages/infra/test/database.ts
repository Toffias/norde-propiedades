// Conexión compartida por los tests de integración de un archivo.

import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, inject } from 'vitest';

import { createDatabase, type Database } from '../src/db/client';

/** Los estados de fábrica de la migración `0016`: sin ellos no nace ninguna oportunidad. */
export const SEEDED_STAGES = {
  new: '01920000-0000-7000-8000-000000000101',
  contacted: '01920000-0000-7000-8000-000000000102',
  visiting: '01920000-0000-7000-8000-000000000103',
  negotiating: '01920000-0000-7000-8000-000000000104',
  won: '01920000-0000-7000-8000-000000000105',
  lost: '01920000-0000-7000-8000-000000000106',
  referred_to_partner: '01920000-0000-7000-8000-000000000107',
} as const;

async function seedOpportunityStages(db: Database) {
  const rows = Object.entries(SEEDED_STAGES).map(
    ([category, id], position) =>
      sql`(${id}, ${category}, '#64748b', ${position}, ${category}, true, now(), now(), 'system:import', 'system:import')`,
  );
  await db.execute(sql`
    insert into core.opportunity_stages
      (id, name, color, position, category, is_active, created_at, updated_at, created_by, updated_by)
    values ${sql.join(rows, sql`, `)}
  `);
  await db.execute(
    sql`update core.opportunity_settings set stage_on_create_id = ${SEEDED_STAGES.new}`,
  );
}

/** Abre la base de tests y la vacía antes de cada test. */
export function useTestDatabase() {
  const connection = createDatabase({
    url: inject('databaseUrl'),
    applicationName: 'norde-infra-tests',
    maxConnections: 4,
  });

  // Vacía todas las tablas de `core` salvo las migraciones, y vuelve a crear las filas únicas de
  // configuración con sus valores por defecto (como las deja la migración).
  beforeEach(async () => {
    await connection.db.execute(sql`
      drop schema if exists pgboss_test cascade;
      do $$
      declare
        tables text;
        singleton record;
      begin
        select string_agg(format('core.%I', tablename), ', ') into tables
        from pg_tables
        where schemaname = 'core' and tablename <> '__drizzle_migrations';
        execute 'truncate ' || tables;

        for singleton in
          select c.conrelid::regclass as name from pg_constraint c
          where c.connamespace = 'core'::regnamespace and c.conname like '%\_singleton'
        loop
          execute format(
            'insert into %s (created_at, updated_at, created_by, updated_by) '
              || 'values (now(), now(), %L, %L)',
            singleton.name, 'system:import', 'system:import'
          );
        end loop;
      end $$;
    `);
    await seedOpportunityStages(connection.db);
  });

  afterAll(() => connection.close());

  return connection.db;
}
