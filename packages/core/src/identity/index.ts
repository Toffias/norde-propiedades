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
export {
  PERMISSION_CATALOG,
  isKnownPermission,
  type UnknownPermissionError,
  type PermissionDefinition,
  type PermissionGroup,
  type PermissionResource,
} from './domain/permission-catalog';
export {
  OWNERSHIP_RULES,
  accessScope,
  canActOn,
  visibilityFilter,
  type AccessScope,
  type OwnedTarget,
  type OwnershipRule,
  type OwnershipSubject,
  type VisibilityFilter,
} from './domain/ownership';
export {
  Role,
  normalizePermissions,
  roleKeyFrom,
  type RoleAlreadyDeletedError,
  type RoleId,
  type RoleInUseError,
  type RoleNotDeletedError,
  type RoleSnapshot,
  type SystemRoleCannotBeDeletedError,
  type SystemRoleCannotBeRenamedError,
} from './domain/role';
export type { RoleEvent } from './domain/role.events';
export type { RoleRepository } from './domain/role.repository';
export {
  User,
  type CannotChangeOwnPermissionsError,
  type CannotSuspendSelfError,
  type DuplicatePermissionError,
  type UserAlreadyActiveError,
  type UserAlreadySuspendedError,
  type UserId,
  type UserNeedsRoleError,
  type UserSnapshot,
} from './domain/user';
export type { UserEvent } from './domain/user.events';
export type { UserRepository } from './domain/user.repository';

export type {
  CredentialStore,
  IdentityTransaction,
  IdentityUnitOfWork,
  UserSessions,
} from './application/ports/identity-transaction';
export type { PasswordHasher } from './application/ports/password-hasher';
export type { RoleListCriteria, RoleListQuery } from './application/ports/role-list-query';
export type { UserAccessQuery, UserAccessRecord } from './application/ports/user-access-query';
export type { UserListCriteria, UserListQuery } from './application/ports/user-list-query';
export type {
  EmailTakenError,
  InvalidInputError,
  RoleNameTakenError,
  RoleNotFoundError,
  UserNotFoundError,
} from './application/user-audit';

export { CreateUser, type CreateUserError } from './application/commands/create-user';
export { UpdateUser, type UpdateUserError } from './application/commands/update-user';
export { SuspendUser, type SuspendUserError } from './application/commands/suspend-user';
export { ReactivateUser, type ReactivateUserError } from './application/commands/reactivate-user';
export {
  ResetUserPassword,
  type ResetUserPasswordError,
} from './application/commands/reset-user-password';
export {
  ChangeOwnPassword,
  type ChangeOwnPasswordError,
} from './application/commands/change-own-password';
export {
  SetUserPermissions,
  type SetUserPermissionsError,
} from './application/commands/set-user-permissions';
export { CreateRole, type CreateRoleError } from './application/commands/create-role';
export { UpdateRole, type UpdateRoleError } from './application/commands/update-role';
export { DeleteRole, type DeleteRoleError } from './application/commands/delete-role';
export { RestoreRole, type RestoreRoleError } from './application/commands/restore-role';
export { ListUsers, type ListUsersError } from './application/queries/list-users';
export { GetRole, type GetRoleError } from './application/queries/get-role';
export {
  GetUserPermissions,
  type GetUserPermissionsError,
} from './application/queries/get-user-permissions';
export { ListRoles, type ListRolesError } from './application/queries/list-roles';
export {
  ResolveSessionActor,
  type ResolveSessionActorError,
  type ResolveSessionActorInput,
  type SessionActor,
} from './application/queries/resolve-session-actor';
