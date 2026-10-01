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

export type UserEvent =
  UserCreated | UserRolesChanged | UserSuspended | UserReactivated | UserPasswordReset;
