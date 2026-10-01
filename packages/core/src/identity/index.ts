// API pública del módulo identity (`@norde/core/identity`).

export * from './contracts';
export {
  PERMISSION_EFFECTS,
  USER_STATUSES,
  canSignIn,
  effectivePermissions,
  isPermissionClaim,
  type EffectivePermissions,
  type PermissionClaim,
  type PermissionEffect,
  type UserPermission,
  type UserStatus,
} from './domain/access';
export type { UserAccessQuery, UserAccessRecord } from './application/ports/user-access-query';
export {
  ResolveSessionActor,
  type ResolveSessionActorError,
  type ResolveSessionActorInput,
  type SessionActor,
} from './application/queries/resolve-session-actor';
