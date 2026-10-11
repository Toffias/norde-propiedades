// Prepara la base de datos de DESARROLLO LOCAL:
//   1. Lee DATABASE_URL de los .env de las apps.
//   2. Crea las bases que no existan (requiere un usuario con permiso CREATEDB).
//   3. Aplica las migraciones del core (Drizzle) y de Payload.
// En producción la base y el rol se crean al aprovisionar el servidor; este script se niega a correr.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

import { ensureDatabase } from './ensure-database';
import { runPnpm } from './run-pnpm';

const ROOT = path.resolve(import.meta.dirname, '../..');
const APPS = ['web', 'gestion', 'agent'] as const;

function readAppEnv(app: string): Record<string, string | undefined> | undefined {
  const file = path.join(ROOT, 'apps', app, '.env');
  return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : undefined;
}

async function main(): Promise<void> {
  const envs = APPS.map((app) => ({ app, env: readAppEnv(app) }));

  const missing = envs.filter((e) => !e.env).map((e) => `apps/${e.app}/.env`);
  if (missing.length > 0) {
    throw new Error(
      `Faltan archivos de entorno: ${missing.join(', ')} (copialos del .env.example)`,
    );
  }

  if (process.env.NODE_ENV === 'production' || envs.some((e) => e.env?.NODE_ENV === 'production')) {
    throw new Error(
      'db:setup es solo para desarrollo local. No se ejecuta con NODE_ENV=production.',
    );
  }

  const urls = new Set(
    envs.map((e) => e.env?.DATABASE_URL).filter((url): url is string => Boolean(url)),
  );
  if (urls.size === 0) throw new Error('Ningún .env define DATABASE_URL.');
  if (urls.size > 1) {
    console.warn('⚠ Las apps apuntan a bases distintas; se preparan todas.');
  }

  for (const url of urls) await ensureDatabase(url);

  const coreUrl = envs.find((e) => e.app === 'agent')?.env?.DATABASE_URL ?? [...urls][0];
  if (!coreUrl) throw new Error('Ningún .env define DATABASE_URL.');
  const coreJournal = path.join(ROOT, 'packages/infra/src/db/migrations/meta/_journal.json');
  if (existsSync(coreJournal)) {
    runPnpm('Migraciones del core (Drizzle)', ['--filter', '@norde/infra', 'db:migrate'], {
      ...process.env,
      DATABASE_URL: coreUrl,
    });
  } else {
    console.log('\n· El core todavía no tiene migraciones: se omite.');
  }

  // Payload lee apps/web/.env por su cuenta.
  runPnpm('Migraciones de Payload', ['--filter', '@norde/web', 'migrate']);

  console.log('\n✓ Base de desarrollo lista. Siguiente paso: pnpm dev');
}

main().catch((error: unknown) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
