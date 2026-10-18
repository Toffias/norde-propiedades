// Alta de usuarios del panel desde scripts (seed de desarrollo y primer administrador).
// Escribe directo en las tablas de `identity` porque todavía no existe el ABM de usuarios (#3):
// cuando exista, estos scripts van a usar su caso de uso.

import { hashPassword } from 'better-auth/crypto';
import type pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';

/** Lo mismo que exige Better Auth en el panel (`minPasswordLength`). */
export const MIN_PASSWORD_LENGTH = 10;

export const NewUserSchema = z.object({
  email: z.email().trim().toLowerCase(),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(128),
  /** Claves de roles de sistema (`admin`, `manager`, `agent`, `rentals-admin`). */
  roles: z.array(z.string().min(1)).min(1),
});

export type NewUser = z.infer<typeof NewUserSchema>;

/** WhatsApp en E.164 (`+5491140001000`): es obligatorio en toda sucursal. */
export const WhatsappSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'El WhatsApp va en formato E.164, por ejemplo +5491140001000');

/** Los scripts actúan como el actor de sistema de importación (`audit_log.source = 'import'`). */
const SCRIPT_ACTOR = 'system:import';

/**
 * Devuelve la casa central. En una base nueva no hay ninguna sucursal: la crea con ese WhatsApp,
 * porque todo usuario tiene que estar en una. Sin WhatsApp y sin casa central, falla.
 */
export async function ensureMainBranch(
  client: pg.Client,
  whatsapp: string | undefined,
): Promise<string> {
  const main = await client.query<{ id: string }>(
    'select id from core.branches where is_main and deleted_at is null limit 1',
  );
  const existing = main.rows[0]?.id;
  if (existing !== undefined) return existing;
  if (whatsapp === undefined) {
    throw new Error('No existe la casa central: pasá su WhatsApp con --whatsapp para crearla');
  }

  const id = uuidv7();
  const name = 'Casa central';
  const e164 = WhatsappSchema.parse(whatsapp);
  await client.query(
    `insert into core.branches (id, name, whatsapp_e164, is_main, created_at, updated_at, created_by, updated_by)
     values ($1, $2, $3, true, now(), now(), $4, $4)`,
    [id, name, e164, SCRIPT_ACTOR],
  );
  await client.query(
    `insert into core.audit_log (id, actor_id, action, entity_type, entity_id, changes, source, occurred_at)
     values ($1, $2, 'branch.created', 'branch', $3, $4, 'import', now())`,
    [
      uuidv7(),
      SCRIPT_ACTOR,
      id,
      JSON.stringify({
        name: { before: null, after: name },
        whatsapp: { before: null, after: e164 },
        isMain: { before: null, after: true },
      }),
    ],
  );
  return id;
}

/**
 * Crea el usuario, su contraseña (cuenta `credential` de Better Auth) y sus roles, y lo audita.
 * Devuelve `undefined` si ya existía un usuario con ese email: no se pisa nada.
 */
export async function createUser(
  client: pg.Client,
  user: NewUser,
  branchId: string,
): Promise<string | undefined> {
  const existing = await client.query<{ id: string }>(
    'select id from core.users where email = $1',
    [user.email],
  );
  if (existing.rows.length > 0) return undefined;

  const roles = await client.query<{ id: string; key: string }>(
    'select id, key from core.roles where key = any($1::text[])',
    [user.roles],
  );
  const missing = user.roles.filter((key) => !roles.rows.some((role) => role.key === key));
  if (missing.length > 0) throw new Error(`No existen los roles: ${missing.join(', ')}`);

  const id = uuidv7();
  await client.query(
    `insert into core.users (id, email, name, branch_id, status, created_at, updated_at, created_by, updated_by)
     values ($1, $2, $3, $4, 'active', now(), now(), $5, $5)`,
    [id, user.email, user.name, branchId, SCRIPT_ACTOR],
  );
  // Better Auth busca la contraseña en la cuenta `credential` cuyo `account_id` es el usuario.
  await client.query(
    `insert into core.accounts (id, user_id, account_id, provider_id, password, created_at, updated_at)
     values ($1, $2, $3, 'credential', $4, now(), now())`,
    // Mismo valor, distinto tipo: `user_id` es uuid y `account_id` es text.
    [uuidv7(), id, id, await hashPassword(user.password)],
  );
  for (const role of roles.rows) {
    await client.query(
      `insert into core.user_roles (user_id, role_id, created_at, created_by)
       values ($1, $2, now(), $3)`,
      [id, role.id, SCRIPT_ACTOR],
    );
  }
  // Alta con sus valores iniciales. El email no va al historial: se referencia por ID.
  await client.query(
    `insert into core.audit_log (id, actor_id, action, entity_type, entity_id, changes, source, occurred_at)
     values ($1, $2, 'user.created', 'user', $3, $4, 'import', now())`,
    [
      uuidv7(),
      SCRIPT_ACTOR,
      id,
      JSON.stringify({
        name: { before: null, after: user.name },
        branchId: { before: null, after: branchId },
        roles: { before: null, after: [...user.roles].sort() },
      }),
    ],
  );
  return id;
}
