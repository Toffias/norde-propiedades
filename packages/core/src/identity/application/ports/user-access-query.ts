import type { RoleSummary } from '../../contracts';
import type { PermissionClaim, UserPermission, UserStatus } from '../../domain/access';

/** Lo que hace falta para armar el `Actor` de un usuario del panel. */
export interface UserAccessRecord {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly status: UserStatus;
  /** Entró con una contraseña temporal y todavía no la cambió. */
  readonly mustChangePassword: boolean;
  readonly roles: readonly RoleSummary[];
  /** Permisos de todos sus roles (puede haber repetidos). */
  readonly rolePermissions: readonly PermissionClaim[];
  readonly userPermissions: readonly UserPermission[];
}

/** Puerto de lectura: infra lo implementa con SQL sobre users, user_roles y los permisos. */
export interface UserAccessQuery {
  findByUserId(userId: string): Promise<UserAccessRecord | undefined>;
}
