import pg from 'pg';

import { parseDatabaseUrl } from './database-url';

/** Crea la base si no existe (requiere un usuario con permiso CREATEDB). */
export async function ensureDatabase(rawUrl: string): Promise<void> {
  const { database, maintenanceUrl, redacted } = parseDatabaseUrl(rawUrl);
  const client = new pg.Client({ connectionString: maintenanceUrl });
  await client.connect();

  try {
    const exists = await client.query('select 1 from pg_database where datname = $1', [database]);
    if (exists.rowCount) {
      console.log(`✓ La base "${database}" ya existe (${redacted})`);
      return;
    }
    // El nombre ya fue validado como identificador seguro en parseDatabaseUrl.
    await client.query(`create database "${database}"`);
    console.log(`✓ Base "${database}" creada (${redacted})`);
  } finally {
    await client.end();
  }
}
