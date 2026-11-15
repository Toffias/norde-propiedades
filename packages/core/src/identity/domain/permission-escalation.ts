// "Solo se otorga lo que se tiene" (#221): quien administra roles o usuarios no puede dar permisos
// que él mismo no tiene, ni tocar a un usuario que tiene más permisos que él. Sin esta regla, un
// permiso delegado (`roles:update`, `users:create`, `users:reset-password`) alcanza para hacerse
// administrador: agregarse `users:*` en su rol, crear un usuario Administrador o blanquearle la
// contraseña a uno.

import { err, ok, type Result } from '../../shared/domain/result';

import type { EffectivePermissions, PermissionClaim } from './access';
import { PERMISSION_CATALOG } from './permission-catalog';

/** Si quien actúa tiene un permiso (lo resuelve `Actor.can`, con sus `deny`). */
export type HoldsPermission = (permission: PermissionClaim) => boolean;

/** Lo que se quiere dar incluye permisos que quien actúa no tiene. */
export interface PermissionEscalationError {
  readonly type: 'PermissionEscalation';
  readonly permissions: readonly PermissionClaim[];
}

/** El usuario a administrar tiene permisos que quien actúa no tiene. */
export interface UserHasMorePermissionsError {
  readonly type: 'UserHasMorePermissions';
}

const NO_PERMISSIONS: EffectivePermissions = { granted: [], denied: [] };

const ACTIONS_BY_RESOURCE: ReadonlyMap<string, readonly PermissionClaim[]> = new Map(
  PERMISSION_CATALOG.flatMap((group) => group.resources).map((resource) => [
    resource.resource,
    resource.permissions.map((definition) => definition.permission),
  ]),
);

function resourceOf(permission: PermissionClaim): string {
  return permission.slice(0, permission.indexOf(':'));
}

function isWildcard(permission: PermissionClaim): boolean {
  return permission.endsWith(':*');
}

function wildcardOf(permission: PermissionClaim): PermissionClaim {
  return `${resourceOf(permission)}:*`;
}

function actionsOf(resource: string): readonly PermissionClaim[] {
  return ACTIONS_BY_RESOURCE.get(resource) ?? [];
}

/**
 * Lo que dan unos permisos efectivos, permiso por permiso: `recurso:*` suma cada acción del
 * catálogo y también el comodín (que alcanza a las acciones que se agreguen después). Un `deny`
 * saca la acción y el comodín de su recurso, que ya no está completo.
 */
export function grantedClaims(permissions: EffectivePermissions): ReadonlySet<PermissionClaim> {
  const claims = new Set<PermissionClaim>();
  for (const permission of permissions.granted) {
    claims.add(permission);
    if (isWildcard(permission)) {
      for (const action of actionsOf(resourceOf(permission))) claims.add(action);
    }
  }
  for (const permission of permissions.denied) {
    claims.delete(permission);
    claims.delete(wildcardOf(permission));
    if (isWildcard(permission)) {
      for (const action of actionsOf(resourceOf(permission))) claims.delete(action);
    }
  }
  return claims;
}

/** Un comodín solo lo tiene quien tiene el comodín y, además, cada acción de su recurso. */
function holdsClaim(permission: PermissionClaim, holds: HoldsPermission): boolean {
  if (!holds(permission)) return false;
  if (!isWildcard(permission)) return true;
  return actionsOf(resourceOf(permission)).every((action) => holds(action));
}

function notHeld(claims: Iterable<PermissionClaim>, holds: HoldsPermission): PermissionClaim[] {
  return [...claims].filter((permission) => !holdsClaim(permission, holds)).sort();
}

/**
 * Un cambio de permisos (de un rol o de un usuario) solo puede sumar lo que quien actúa tiene.
 * Quitar siempre se puede. `before` es lo que había (nada, en un alta).
 */
export function ensureGrantsHeld(
  after: EffectivePermissions,
  holds: HoldsPermission,
  before: EffectivePermissions = NO_PERMISSIONS,
): Result<void, PermissionEscalationError> {
  const previous = grantedClaims(before);
  const gained = [...grantedClaims(after)].filter((permission) => !previous.has(permission));
  const missing = notHeld(gained, holds);
  return missing.length === 0
    ? ok(undefined)
    : err({ type: 'PermissionEscalation', permissions: missing });
}

/**
 * Para editar, suspender o blanquear a un usuario, quien actúa tiene que tener todo lo que ese
 * usuario tiene: con `users:reset-password` no se le blanquea la contraseña a un administrador.
 */
export function ensureCanManageUser(
  target: EffectivePermissions,
  holds: HoldsPermission,
): Result<void, UserHasMorePermissionsError> {
  return notHeld(grantedClaims(target), holds).length === 0
    ? ok(undefined)
    : err({ type: 'UserHasMorePermissions' });
}
