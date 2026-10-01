import type { AuditState, AuditTarget } from '../../shared';
import type { User } from '../domain/user';

/**
 * Lo que se audita de un usuario: sus datos y sus roles, crudos. La contraseña nunca (ni el hash):
 * el blanqueo y el cambio quedan como acciones sin valores.
 */
export function userAuditState(user: User): AuditState {
  const { name, email, phone, status, roleIds, permissions } = user.toSnapshot();
  return {
    name,
    email: email.value,
    phone: phone?.e164,
    status,
    roleIds: [...roleIds],
    // `grant:clients:export`, `deny:rentals:delete`. Sin permisos propios no se registra el campo.
    permissions:
      permissions.length === 0 ? undefined : permissions.map((p) => `${p.effect}:${p.permission}`),
  };
}

export function userTarget(action: string, userId: string): AuditTarget {
  return { action, entityType: 'user', entityId: userId, clientIds: [] };
}

export interface InvalidInputError {
  readonly type: 'InvalidInput';
  readonly issues: readonly string[];
}

export interface UserNotFoundError {
  readonly type: 'UserNotFound';
}

export interface EmailTakenError {
  readonly type: 'EmailTaken';
}

export interface RoleNotFoundError {
  readonly type: 'RoleNotFound';
}

export interface RoleNameTakenError {
  readonly type: 'RoleNameTaken';
}
