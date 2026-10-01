// Prepara la base de los tests de integración: Postgres real, base separada `<base>_test`.
//
// - TEST_DATABASE_URL, si está definida (CI: un Postgres de servicio).
// - Si no, la DATABASE_URL de apps/agent/.env con el sufijo `_test` (desarrollo local).
//
// La base se crea si falta, se borra el esquema `core` y se aplican las migraciones desde cero.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;

function testDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  if (explicit) return explicit;

  const envFile = path.join(ROOT, 'apps/agent/.env');
  const devUrl = existsSync(envFile)
    ? parseEnv(readFileSync(envFile, 'utf8')).DATABASE_URL
    : undefined;
  if (!devUrl) {
    throw new Error('Definí TEST_DATABASE_URL o DATABASE_URL en apps/agent/.env');
  }
  const url = new URL(devUrl);
  url.pathname = `${url.pathname.replace(/^\//, '').replace(/_test$/, '')}_test`;
  return url.toString();
}

async function ensureDatabase(rawUrl: string): Promise<void> {
  const url = new URL(rawUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!SAFE_IDENTIFIER.test(database)) throw new Error(`Nombre de base inválido: ${database}`);
  if (!database.endsWith('_test')) {
    throw new Error(`Por seguridad, la base de tests tiene que terminar en _test: ${database}`);
  }

  url.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  try {
    const exists = await admin.query('select 1 from pg_database where datname = $1', [database]);
    if (!exists.rowCount) await admin.query(`create database "${database}"`);
  } finally {
    await admin.end();
  }
}

export async function setup(project: TestProject): Promise<void> {
  const url = testDatabaseUrl();
  await ensureDatabase(url);

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await pool.query('drop schema if exists core cascade');
    await migrate(drizzle(pool), {
      migrationsFolder: path.resolve(import.meta.dirname, '../src/db/migrations'),
      migrationsSchema: 'core',
      migrationsTable: '__drizzle_migrations',
    });
    // Los mismos roles que en producción; el usuario de los tests los toma con `set local role`.
    await pool.query(
      readFileSync(path.resolve(import.meta.dirname, '../src/db/roles.sql'), 'utf8'),
    );
    await pool.query('grant norde_app, norde_erasure to current_user');
  } finally {
    await pool.end();
  }

  project.provide('databaseUrl', url);
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
