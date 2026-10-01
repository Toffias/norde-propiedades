// Crea el primer administrador del panel (o uno nuevo), en cualquier entorno, incluido producción.
// Idempotente: si el email ya existe no toca nada.
//
//   ADMIN_PASSWORD='…' pnpm user:create-admin --email ana@norde.com.ar --name "Ana Pérez"
//
// La contraseña va por variable de entorno para que no quede en el historial de la terminal.
// La base sale de DATABASE_URL o, si no está, de apps/agent/.env (la misma que usan las apps).

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs, parseEnv } from 'node:util';

import pg from 'pg';

import { parseDatabaseUrl } from './database-url';
import { createUser, NewUserSchema } from './users';

const ROOT = path.resolve(import.meta.dirname, '../..');

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const file = path.join(ROOT, 'apps/agent/.env');
  const url = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')).DATABASE_URL : undefined;
  if (!url) throw new Error('Falta DATABASE_URL (variable de entorno o apps/agent/.env)');
  return url;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, name: { type: 'string' } },
  });
  const user = NewUserSchema.parse({
    email: values.email,
    name: values.name,
    password: process.env.ADMIN_PASSWORD,
    roles: ['admin'],
  });

  const url = databaseUrl();
  const client = new pg.Client({ connectionString: url, application_name: 'norde-create-admin' });
  await client.connect();
  try {
    await client.query('begin');
    const id = await createUser(client, user);
    await client.query('commit');
    console.log(
      id === undefined
        ? `Ya existe un usuario con ese email en ${parseDatabaseUrl(url).redacted}: no se cambió nada.`
        : `✓ Administrador creado en ${parseDatabaseUrl(url).redacted} (id ${id}).`,
    );
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
