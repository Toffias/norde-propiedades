import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

import { z } from 'zod';

import { parseDatabaseUrl } from './database-url';

const ROOT = path.resolve(import.meta.dirname, '../..');

/** La base de los tests e2e cuando no hay `.env` (CI): el rol `norde` de `create-dev-database.sql`. */
export const DEFAULT_E2E_DATABASE_URL = 'postgres://norde:norde@localhost:5432/norde_e2e';

/**
 * La URL de la base e2e, en este orden:
 *   1. `E2E_DATABASE_URL`, si está definida.
 *   2. La base de desarrollo (`devDatabaseUrl`) con el sufijo `_e2e`: mismas credenciales, otra base.
 *   3. `DEFAULT_E2E_DATABASE_URL`.
 * Siempre exige que el nombre termine en `_e2e`, para no borrar por error la base de desarrollo.
 */
export function e2eDatabaseUrl(env: NodeJS.ProcessEnv, devDatabaseUrl?: string): string {
  if (env.NODE_ENV === 'production') {
    throw new Error('La base e2e es solo para desarrollo local y CI.');
  }
  const url = env.E2E_DATABASE_URL ?? withE2eSuffix(devDatabaseUrl) ?? DEFAULT_E2E_DATABASE_URL;
  const { database } = parseDatabaseUrl(url);
  if (!database.endsWith('_e2e')) {
    throw new Error(`Por seguridad, la base e2e tiene que terminar en _e2e: ${database}`);
  }
  return url;
}

function withE2eSuffix(devDatabaseUrl: string | undefined): string | undefined {
  if (devDatabaseUrl === undefined) return undefined;
  const { database } = parseDatabaseUrl(devDatabaseUrl);
  const url = new URL(devDatabaseUrl);
  url.pathname = `/${database}_e2e`;
  return url.toString();
}

/** El `DATABASE_URL` de `apps/gestion/.env`, si existe. */
export function readGestionDatabaseUrl(): string | undefined {
  const file = path.join(ROOT, 'apps/gestion/.env');
  if (!existsSync(file)) return undefined;
  const value = parseEnv(readFileSync(file, 'utf8')).DATABASE_URL?.trim();
  return value === undefined || value === '' ? undefined : value;
}

const E2eEnvSchema = z.object({
  CI: z.string().optional(),
  /** `dev` sirve el panel con `next dev`; `start`, el build de producción (el de CI). */
  E2E_SERVER: z.enum(['dev', 'start']).optional(),
});

export interface E2eEnv {
  readonly ci: boolean;
  readonly server: 'dev' | 'start';
  readonly databaseUrl: string;
}

/** El entorno de los tests e2e del panel, para `apps/gestion/playwright.config.ts`. */
export function readE2eEnv(env: NodeJS.ProcessEnv = process.env): E2eEnv {
  const parsed = E2eEnvSchema.parse(env);
  const ci = parsed.CI !== undefined && parsed.CI !== '' && parsed.CI !== 'false';
  return {
    ci,
    server: parsed.E2E_SERVER ?? (ci ? 'start' : 'dev'),
    databaseUrl: e2eDatabaseUrl(env, readGestionDatabaseUrl()),
  };
}
