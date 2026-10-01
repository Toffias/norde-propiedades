// Datos de prueba de identity: usuarios y actores de ejemplo para los tests de casos de uso.

import { Actor, Email, parseId, Phone, type Result } from '../../shared';
import type { UserSnapshot } from '../domain/user';

export const TEST_NOW = new Date('2026-10-01T12:00:00Z');
export const ROLE_AGENT_ID = '00000000-0000-7000-8000-00000000000a';
export const ROLE_MANAGER_ID = '00000000-0000-7000-8000-00000000000b';
export const ADMIN_USER_ID = '00000000-0000-7000-8000-0000000000aa';

/** Administrador del panel: puede todo sobre usuarios y roles. */
export const TEST_ADMIN = Actor.user(ADMIN_USER_ID, ['users:*', 'roles:*']).withCorrelation(
  'req-1',
);
/** Agente sin permisos sobre usuarios. */
export const TEST_AGENT = Actor.user('00000000-0000-7000-8000-0000000000bb', ['clients:read']);

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error('Invalid test fixture');
  return result.value;
}

/** `Id<'User'>` a partir de un UUID de prueba. */
export function testUserId(raw: string) {
  return unwrap(parseId<'User'>(raw));
}

export function userSnapshot(overrides: Partial<UserSnapshot> = {}): UserSnapshot {
  return {
    id: testUserId('00000000-0000-7000-8000-000000000001'),
    name: 'Camila Pérez',
    email: unwrap(Email.create('camila@norde.com.ar')),
    phone: unwrap(Phone.create('+5491166899124')),
    status: 'active',
    roleIds: [ROLE_AGENT_ID],
    mustChangePassword: false,
    createdAt: new Date('2026-09-01T12:00:00Z'),
    updatedAt: new Date('2026-09-01T12:00:00Z'),
    ...overrides,
  };
}

// Contraseñas de prueba: solo para los fakes, no son secretos.
export const TEMPORARY_PASSWORD = 'temporal-12345'; // gitleaks:allow
export const OWN_PASSWORD = 'mi-clave-nueva-1'; // gitleaks:allow
export const OTHER_PASSWORD = 'otra-clave-123'; // gitleaks:allow
