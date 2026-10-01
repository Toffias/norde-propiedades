// Conexión compartida por los tests de integración de un archivo.

import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, inject } from 'vitest';

import { createDatabase } from '../src/db/client';

/** Abre la base de tests y la vacía antes de cada test. */
export function useTestDatabase() {
  const connection = createDatabase({
    url: inject('databaseUrl'),
    applicationName: 'norde-infra-tests',
    maxConnections: 4,
  });

  // Vacía todas las tablas de `core`, salvo las migraciones y las filas únicas de configuración
  // (las inserta la migración y los tests las leen).
  beforeEach(async () => {
    await connection.db.execute(sql`
      drop schema if exists pgboss_test cascade;
      do $$
      declare
        tables text;
      begin
        select string_agg(format('core.%I', t.tablename), ', ') into tables
        from pg_tables t
        where t.schemaname = 'core'
          and t.tablename <> '__drizzle_migrations'
          and not exists (
            select 1 from pg_constraint c
            where c.conrelid = format('core.%I', t.tablename)::regclass
              and c.conname like '%\_singleton'
          );
        execute 'truncate ' || tables || ' cascade';
      end $$;
    `);
  });

  afterAll(() => connection.close());

  return connection.db;
}
