// Siempre tiene que quedar alguien que pueda administrar usuarios y roles.

import type { PermissionClaim } from './access';
import type { User } from './user';

/** La clave del rol del sistema Administrador. */
export const ADMIN_ROLE_KEY = 'admin';

/**
 * Lo mínimo para administrar el panel: editar roles y usuarios, suspenderlos y darles permisos.
 * Sin esto, nadie puede devolverle el acceso a nadie.
 */
export const ADMIN_ESSENTIAL_PERMISSIONS: readonly PermissionClaim[] = [
  'roles:update',
  'users:update',
  'users:suspend',
  'users:permissions',
];

function wildcardOf(permission: PermissionClaim): PermissionClaim {
  return `${permission.split(':')[0] ?? ''}:*`;
}

function covers(claims: readonly string[], permission: PermissionClaim): boolean {
  return claims.includes(permission) || claims.includes(wildcardOf(permission));
}

/** Si los permisos de un rol alcanzan para administrar (exactos o con `recurso:*`). */
export function keepsAdminPowers(permissions: readonly string[]): boolean {
  return ADMIN_ESSENTIAL_PERMISSIONS.every((permission) => covers(permissions, permission));
}

/** Los permisos propios que, negados, le quitan a alguien la administración. */
export const ADMIN_BLOCKING_DENIALS: readonly PermissionClaim[] = [
  ...new Set(
    ADMIN_ESSENTIAL_PERMISSIONS.flatMap((permission) => [permission, wildcardOf(permission)]),
  ),
];

/**
 * Un administrador: activo, con el rol Administrador y sin ninguno de sus permisos esenciales
 * negado a mano.
 */
export function isAdministrator(user: User, adminRoleId: string): boolean {
  if (user.status !== 'active' || !user.roleIds.includes(adminRoleId)) return false;
  const denied = user.permissions
    .filter((own) => own.effect === 'deny')
    .map((own) => own.permission);
  return !denied.some((permission) => ADMIN_BLOCKING_DENIALS.includes(permission));
}

export interface LastAdministratorError {
  readonly type: 'LastAdministrator';
}
export interface AdminRoleNeedsPermissionsError {
  readonly type: 'AdminRoleNeedsPermissions';
}
