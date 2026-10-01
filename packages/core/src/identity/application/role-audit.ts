import type { AuditState, AuditTarget } from '../../shared';
import type { Role } from '../domain/role';

/** Lo que se audita de un rol: nombre, descripción y permisos (los usuarios se auditan aparte). */
export function roleAuditState(role: Role): AuditState {
  const { name, description, permissions } = role.toSnapshot();
  return { name, description, permissions: [...permissions] };
}

export function roleTarget(action: string, roleId: string): AuditTarget {
  return { action, entityType: 'role', entityId: roleId, clientIds: [] };
}
