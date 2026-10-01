import 'server-only';

// Composition root: único archivo de la app que importa @norde/infra.
// Arma los casos de uso de @norde/core que usan los Server Components y las Server Actions.

import {
  AddTeamMember,
  ChangeOwnPassword,
  CreateBranch,
  CreateRole,
  CreateTeam,
  CreateUser,
  DeleteBranch,
  DeleteRole,
  DeleteTeam,
  GetBranch,
  GetRole,
  GetTeam,
  GetUserPermissions,
  ListBranches,
  ListRoles,
  ListTeams,
  ListUsers,
  MakeMainBranch,
  ReactivateUser,
  ResetUserPassword,
  RemoveTeamMember,
  ResolveSessionActor,
  RestoreBranch,
  RestoreRole,
  RestoreTeam,
  SetUserPermissions,
  SuspendUser,
  UpdateBranch,
  UpdateRole,
  UpdateTeam,
  UpdateUser,
} from '@norde/core/identity';
import type { IdGenerator } from '@norde/core/shared';
import {
  BetterAuthPasswordHasher,
  BetterAuthSessionReader,
  createAuth,
  createDatabase,
  createIdentityUnitOfWork,
  DrizzleAuditLog,
  DrizzleOrganizationQuery,
  DrizzleRoleListQuery,
  DrizzleUserAccessQuery,
  DrizzleUserListQuery,
  SystemClock,
  UuidV7IdGenerator,
  type DatabaseConnection,
} from '@norde/infra';
import { nextCookies } from 'better-auth/next-js';

import { getEnv } from './config/env';
import { getLogger } from './config/logger';

export interface Container {
  readonly database: DatabaseConnection;
  readonly ids: IdGenerator;
  /** Endpoints de Better Auth (`/api/auth/*`): ingreso, salida y sesión. */
  readonly handleAuthRequest: (request: Request) => Promise<Response>;
  readonly sessions: BetterAuthSessionReader;
  readonly resolveSessionActor: ResolveSessionActor;
  readonly identity: {
    readonly listUsers: ListUsers;
    readonly listRoles: ListRoles;
    readonly createUser: CreateUser;
    readonly updateUser: UpdateUser;
    readonly suspendUser: SuspendUser;
    readonly reactivateUser: ReactivateUser;
    readonly resetUserPassword: ResetUserPassword;
    readonly changeOwnPassword: ChangeOwnPassword;
    readonly getUserPermissions: GetUserPermissions;
    readonly setUserPermissions: SetUserPermissions;
    readonly getRole: GetRole;
    readonly createRole: CreateRole;
    readonly updateRole: UpdateRole;
    readonly deleteRole: DeleteRole;
    readonly restoreRole: RestoreRole;
    readonly listBranches: ListBranches;
    readonly getBranch: GetBranch;
    readonly createBranch: CreateBranch;
    readonly updateBranch: UpdateBranch;
    readonly makeMainBranch: MakeMainBranch;
    readonly deleteBranch: DeleteBranch;
    readonly restoreBranch: RestoreBranch;
    readonly listTeams: ListTeams;
    readonly getTeam: GetTeam;
    readonly createTeam: CreateTeam;
    readonly updateTeam: UpdateTeam;
    readonly deleteTeam: DeleteTeam;
    readonly restoreTeam: RestoreTeam;
    readonly addTeamMember: AddTeamMember;
    readonly removeTeamMember: RemoveTeamMember;
  };
}

let container: Container | undefined;

function createContainer(): Container {
  const env = getEnv();
  const database = createDatabase({ url: env.DATABASE_URL, applicationName: 'norde-gestion' });
  const ids = new UuidV7IdGenerator();
  const clock = new SystemClock();

  const auth = createAuth({
    db: database.db,
    secret: env.BETTER_AUTH_SECRET,
    baseUrl: env.BETTER_AUTH_URL,
    ids,
    audit: new DrizzleAuditLog(database.db, ids, clock),
    logger: getLogger(),
    // `nextCookies` va último: deja escribir la cookie de sesión desde Server Actions.
    plugins: [nextCookies()],
    rateLimit: env.NODE_ENV === 'production',
  });

  const identityUow = createIdentityUnitOfWork(database.db, { ids, clock });
  const hasher = new BetterAuthPasswordHasher();
  const userAccess = new DrizzleUserAccessQuery(database.db);
  const roleQuery = new DrizzleRoleListQuery(database.db);
  const organization = new DrizzleOrganizationQuery(database.db);

  return {
    database,
    ids,
    handleAuthRequest: (request) => auth.handler(request),
    sessions: new BetterAuthSessionReader(auth),
    resolveSessionActor: new ResolveSessionActor({ users: userAccess }),
    identity: {
      listUsers: new ListUsers({ users: new DrizzleUserListQuery(database.db) }),
      listRoles: new ListRoles({ roles: roleQuery }),
      createUser: new CreateUser({ uow: identityUow, hasher, ids, clock }),
      updateUser: new UpdateUser({ uow: identityUow, clock }),
      suspendUser: new SuspendUser({ uow: identityUow, clock }),
      reactivateUser: new ReactivateUser({ uow: identityUow, clock }),
      resetUserPassword: new ResetUserPassword({ uow: identityUow, hasher, clock }),
      changeOwnPassword: new ChangeOwnPassword({ uow: identityUow, hasher, clock }),
      getUserPermissions: new GetUserPermissions({ users: userAccess }),
      setUserPermissions: new SetUserPermissions({ uow: identityUow, clock }),
      getRole: new GetRole({ roles: roleQuery }),
      createRole: new CreateRole({ uow: identityUow, ids, clock }),
      updateRole: new UpdateRole({ uow: identityUow, clock }),
      deleteRole: new DeleteRole({ uow: identityUow, clock }),
      restoreRole: new RestoreRole({ uow: identityUow, clock }),
      listBranches: new ListBranches({ organization }),
      getBranch: new GetBranch({ organization }),
      createBranch: new CreateBranch({ uow: identityUow, ids, clock }),
      updateBranch: new UpdateBranch({ uow: identityUow, clock }),
      makeMainBranch: new MakeMainBranch({ uow: identityUow, clock }),
      deleteBranch: new DeleteBranch({ uow: identityUow, clock }),
      restoreBranch: new RestoreBranch({ uow: identityUow, clock }),
      listTeams: new ListTeams({ organization }),
      getTeam: new GetTeam({ organization }),
      createTeam: new CreateTeam({ uow: identityUow, ids, clock }),
      updateTeam: new UpdateTeam({ uow: identityUow, clock }),
      deleteTeam: new DeleteTeam({ uow: identityUow, clock }),
      restoreTeam: new RestoreTeam({ uow: identityUow, clock }),
      addTeamMember: new AddTeamMember({ uow: identityUow, clock }),
      removeTeamMember: new RemoveTeamMember({ uow: identityUow, clock }),
    },
  };
}

/** Se crea al primer uso y se reutiliza durante toda la vida del proceso. */
export function getContainer(): Container {
  container ??= createContainer();
  return container;
}
