// Acceso de un usuario al panel: con qué estado puede entrar y qué permisos tiene.

/** `recurso:acción` (`clients:update`); `recurso:*` es toda acción sobre el recurso. */
export type PermissionClaim = `${string}:${string}`;

const PERMISSION_PATTERN = /^[a-z][a-z-]*:(?:[a-z][a-z-]*|\*)$/;

/** Valida un permiso guardado en la base antes de usarlo. */
export function isPermissionClaim(raw: string): raw is PermissionClaim {
  return PERMISSION_PATTERN.test(raw);
}

export const USER_STATUSES = ['active', 'suspended'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Un usuario suspendido no entra al panel, aunque tenga una sesión abierta. */
export function canSignIn(status: UserStatus): boolean {
  return status === 'active';
}

export const PERMISSION_EFFECTS = ['grant', 'deny'] as const;
export type PermissionEffect = (typeof PERMISSION_EFFECTS)[number];

/** Permiso propio de un usuario, además de los de sus roles. */
export interface UserPermission {
  readonly permission: PermissionClaim;
  readonly effect: PermissionEffect;
}

export interface EffectivePermissions {
  readonly granted: readonly PermissionClaim[];
  /** Ganan sobre `granted`, también sobre un `recurso:*` (lo resuelve `Actor.can`). */
  readonly denied: readonly PermissionClaim[];
}

/**
 * Permisos efectivos: la unión de los permisos de sus roles, más sus `grant`, menos sus `deny`.
 * Un `deny` no se puede descontar de un `recurso:*` sin conocer todas las acciones, así que viaja
 * aparte y el `Actor` lo aplica.
 */
export function effectivePermissions(
  rolePermissions: readonly PermissionClaim[],
  userPermissions: readonly UserPermission[],
): EffectivePermissions {
  const denied = new Set(
    userPermissions.filter((own) => own.effect === 'deny').map((own) => own.permission),
  );
  const granted = new Set([
    ...rolePermissions,
    ...userPermissions.filter((own) => own.effect === 'grant').map((own) => own.permission),
  ]);
  for (const permission of denied) granted.delete(permission);
  return { granted: [...granted].sort(), denied: [...denied].sort() };
}
