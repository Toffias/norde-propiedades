import type { DomainEvent } from '../../shared/domain/domain-event';

export type UserCreated = DomainEvent<'identity.user_created', { readonly userId: string }>;

export type UserRolesChanged = DomainEvent<
  'identity.user_roles_changed',
  { readonly userId: string; readonly roleIds: readonly string[] }
>;

export type UserSuspended = DomainEvent<'identity.user_suspended', { readonly userId: string }>;

export type UserReactivated = DomainEvent<'identity.user_reactivated', { readonly userId: string }>;

export type UserPasswordReset = DomainEvent<
  'identity.user_password_reset',
  { readonly userId: string }
>;

export type UserPermissionsChanged = DomainEvent<
  'identity.user_permissions_changed',
  { readonly userId: string }
>;

/**
 * Pasó a otra sucursal (#221). Lo que guarda una copia de la sucursal del dueño (contactos,
 * oportunidades, propiedades, emprendimientos) se mueve con él, para que las reglas "de su
 * sucursal" sigan valiendo.
 */
export type UserBranchChanged = DomainEvent<
  'identity.user_branch_changed',
  { readonly userId: string; readonly fromBranchId: string; readonly toBranchId: string }
>;

export type UserEvent =
  | UserBranchChanged
  | UserPermissionsChanged
  | UserCreated
  | UserRolesChanged
  | UserSuspended
  | UserReactivated
  | UserPasswordReset;
