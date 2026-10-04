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
  Branch,
  type BranchAlreadyDeletedError,
  type BranchContact,
  type BranchHasMembersError,
  type BranchHasTeamsError,
  type BranchId,
  type BranchNotDeletedError,
  type BranchSnapshot,
  type MainBranchCannotBeDeletedError,
} from './domain/branch';
export type { BranchEvent } from './domain/branch.events';
export {
  Team,
  type TeamAlreadyDeletedError,
  type TeamDeletedError,
  type TeamId,
  type TeamNotDeletedError,
  type TeamSnapshot,
} from './domain/team';
export type { TeamEvent } from './domain/team.events';
export type { BranchRepository, TeamRepository } from './domain/organization.repository';
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
export type {
  BranchListCriteria,
  OrganizationQuery,
  TeamListCriteria,
} from './application/ports/organization-query';
export type { PasswordHasher } from './application/ports/password-hasher';
export type { FavoriteQuery, UserFavorites } from './application/ports/user-favorites';
export type { RoleListCriteria, RoleListQuery } from './application/ports/role-list-query';
export type { UserAccessQuery, UserAccessRecord } from './application/ports/user-access-query';
export type { UserListCriteria, UserListQuery } from './application/ports/user-list-query';
export type {
  BranchNotFoundError,
  EmailTakenError,
  InvalidInputError,
  NameTakenError,
  TeamNotFoundError,
  RoleNameTakenError,
  RoleNotFoundError,
  UserNotFoundError,
} from './application/user-audit';

export {
  AddFavorites,
  RemoveFavorites,
  type ChangeFavoritesError,
  type ChangeFavoritesOutput,
} from './application/commands/change-favorites';
export { GetFavoriteIds } from './application/queries/get-favorite-ids';
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
export { CreateBranch, type CreateBranchError } from './application/commands/create-branch';
export { UpdateBranch, type UpdateBranchError } from './application/commands/update-branch';
export { MakeMainBranch, type MakeMainBranchError } from './application/commands/make-main-branch';
export { DeleteBranch, type DeleteBranchError } from './application/commands/delete-branch';
export { RestoreBranch, type RestoreBranchError } from './application/commands/restore-branch';
export { CreateTeam, type CreateTeamError } from './application/commands/create-team';
export { UpdateTeam, type UpdateTeamError } from './application/commands/update-team';
export { DeleteTeam, type DeleteTeamError } from './application/commands/delete-team';
export { RestoreTeam, type RestoreTeamError } from './application/commands/restore-team';
export { AddTeamMember, type AddTeamMemberError } from './application/commands/add-team-member';
export {
  RemoveTeamMember,
  type RemoveTeamMemberError,
} from './application/commands/remove-team-member';
export { ListBranches, type ListBranchesError } from './application/queries/list-branches';
export { GetBranch, type GetBranchError } from './application/queries/get-branch';
export { ListTeams, type ListTeamsError } from './application/queries/list-teams';
export { GetTeam, type GetTeamError } from './application/queries/get-team';
export {
  ResolveSessionActor,
  type ResolveSessionActorError,
  type ResolveSessionActorInput,
  type SessionActor,
} from './application/queries/resolve-session-actor';
export {
  RemoveErasedClientFavorites,
  type RemoveErasedClientFavoritesError,
} from './application/handlers/remove-erased-client-favorites';
export type { ClientFavoriteErasure } from './application/ports/client-favorite-erasure';
export {
  MoveMergedClientFavorites,
  type MoveMergedClientFavoritesError,
} from './application/handlers/move-merged-client-favorites';
