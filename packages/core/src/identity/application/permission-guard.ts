import type { Actor } from '../../shared';
import {
  effectivePermissions,
  type EffectivePermissions,
  type PermissionClaim,
  type UserPermission,
} from '../domain/access';
import type { HoldsPermission } from '../domain/permission-escalation';
import type { RoleRepository } from '../domain/role.repository';
import type { User } from '../domain/user';

import { findRole } from './role-lookup';

/** `Actor.can` como la regla de dominio lo pide. */
export function holdsOf(actor: Actor): HoldsPermission {
  return (permission) => actor.can(permission);
}

/** Permisos efectivos de unos roles y unos permisos propios (los roles que no existen no suman). */
export async function permissionsOf(
  roles: RoleRepository,
  roleIds: readonly string[],
  own: readonly UserPermission[] = [],
): Promise<EffectivePermissions> {
  const fromRoles: PermissionClaim[] = [];
  for (const roleId of roleIds) {
    const role = await findRole(roles, roleId);
    if (role) fromRoles.push(...role.toSnapshot().permissions);
  }
  return effectivePermissions(fromRoles, own);
}

/** Permisos efectivos de un usuario, como los arma su sesión. */
export async function userPermissionsOf(
  roles: RoleRepository,
  user: User,
): Promise<EffectivePermissions> {
  const { roleIds, permissions } = user.toSnapshot();
  return permissionsOf(roles, roleIds, permissions);
}
