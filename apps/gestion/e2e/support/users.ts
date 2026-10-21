import { readFileSync } from 'node:fs';
import path from 'node:path';

// Los usuarios del panel que carga el seed (`scripts/db/seed/users.json`), uno por rol.

export type Role = 'admin' | 'manager' | 'agent' | 'rentals-admin';

interface SeedUser {
  readonly email: string;
  readonly name: string;
  readonly password: string;
  readonly roles: readonly string[];
}

// El seed valida este archivo con Zod al cargarlo en la base.
const SEED_USERS = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../../../../scripts/db/seed/users.json'), 'utf8'),
) as readonly SeedUser[];

export const ROLES: readonly Role[] = ['admin', 'manager', 'agent', 'rentals-admin'];

export function seedUser(role: Role): SeedUser {
  const user = SEED_USERS.find((candidate) => candidate.roles.includes(role));
  if (user === undefined) throw new Error(`El seed no tiene un usuario con el rol ${role}`);
  return user;
}

/** La sesión guardada de cada rol, que arma `auth.setup.ts`. */
export function storageStateFor(role: Role): string {
  return path.resolve(import.meta.dirname, `../.auth/${role}.json`);
}
