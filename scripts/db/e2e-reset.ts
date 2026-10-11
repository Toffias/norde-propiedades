// Deja la base de los tests e2e del panel en un estado conocido, antes de cada corrida:
//   1. Crea la base si falta (el nombre tiene que terminar en `_e2e`).
//   2. Borra los esquemas `core` y `pgboss` y aplica las migraciones del core desde cero.
//   3. Carga el seed de desarrollo: propiedades, un usuario por rol y consultas.
// La URL sale de E2E_DATABASE_URL o de la base de apps/gestion/.env con el sufijo `_e2e` (ver
// `e2e-database.ts`). Nunca toca la base de desarrollo.

import pg from 'pg';

import { parseDatabaseUrl } from './database-url';
import { e2eDatabaseUrl, readGestionDatabaseUrl } from './e2e-database';
import { ensureDatabase } from './ensure-database';
import { runPnpm } from './run-pnpm';

async function dropSchemas(url: string): Promise<void> {
  const client = new pg.Client({ connectionString: url, application_name: 'norde-e2e-reset' });
  await client.connect();
  try {
    await client.query('drop schema if exists core cascade');
    await client.query('drop schema if exists pgboss cascade');
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const url = e2eDatabaseUrl(process.env, readGestionDatabaseUrl());
  await ensureDatabase(url);
  await dropSchemas(url);
  console.log(`✓ Esquemas core y pgboss borrados en ${parseDatabaseUrl(url).redacted}`);

  const env = { ...process.env, DATABASE_URL: url };
  runPnpm('Migraciones del core (Drizzle)', ['--filter', '@norde/infra', 'db:migrate'], env);
  runPnpm('Seed de prueba', ['--filter', '@norde/scripts', 'db:seed'], env);

  console.log('\n✓ Base e2e lista.');
}

main().catch((error: unknown) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
