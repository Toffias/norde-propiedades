// Aplica los roles y permisos del esquema `core` (packages/infra/src/db/roles.sql).
//
// Es idempotente y se corre después de cada `drizzle-kit migrate`, con el dueño de la base:
//   - Desarrollo: lo llama `pnpm db:setup`.
//   - Deploy: `DATABASE_URL=<url del dueño> pnpm db:roles` (docs/arquitectura.md §10).

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

import pg from 'pg';

import { parseDatabaseUrl } from './database-url';

const ROOT = path.resolve(import.meta.dirname, '../..');
const ROLES_SQL = path.join(ROOT, 'packages/infra/src/db/roles.sql');

export async function applyDatabaseRoles(databaseUrl: string): Promise<void> {
  const { redacted } = parseDatabaseUrl(databaseUrl);
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(readFileSync(ROLES_SQL, 'utf8'));
    console.log(`✓ Roles de la base aplicados (${redacted})`);
  } finally {
    await client.end();
  }
}

function databaseUrlFromEnv(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = path.join(ROOT, 'apps/agent/.env');
  const url = existsSync(envFile)
    ? parseEnv(readFileSync(envFile, 'utf8')).DATABASE_URL
    : undefined;
  if (!url) throw new Error('Definí DATABASE_URL o creá apps/agent/.env');
  return url;
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  applyDatabaseRoles(databaseUrlFromEnv()).catch((error: unknown) => {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
