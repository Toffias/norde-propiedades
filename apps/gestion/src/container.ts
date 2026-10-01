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
import {
  AllocateReferenceCode,
  ChangeCompanyLogo,
  ChangeReferenceCodePrefix,
  ChangeWatermarkLogo,
  ConfigureWatermark,
  CreateFolder,
  CreateReferenceCodeSequence,
  DeleteFolder,
  DeleteReferenceCodeSequence,
  GetCompanyFileDownload,
  GetCompanyLogo,
  GetCompanySettings,
  ListFolderContents,
  ListReferenceCodeSequences,
  ListTrashedFiles,
  MoveCompanyFileToTrash,
  PreviewWatermark,
  RenameCompanyFile,
  RenameFolder,
  RestoreCompanyFile,
  SearchDirectory,
  SendTestEmail,
  UpdateEmailSender,
  UpdateGeneralSettings,
  UpdatePdfOptions,
  UpdatePortalDescriptionFooter,
  UploadCompanyFile,
  type FileStorage,
} from '@norde/core/settings';
import type { Clock, IdGenerator } from '@norde/core/shared';
import {
  BetterAuthPasswordHasher,
  BetterAuthSessionReader,
  createAuth,
  createDatabase,
  createIdentityUnitOfWork,
  createSettingsUnitOfWork,
  DrizzleAuditLog,
  DrizzleCompanyFileRepository,
  DrizzleCompanyFilesQuery,
  DrizzleCompanySettingsRepository,
  DrizzleDirectory,
  DrizzleOrganizationQuery,
  DrizzleReferenceCodeSequenceQuery,
  DrizzleRoleListQuery,
  DrizzleUserAccessQuery,
  DrizzleUserListQuery,
  LocalFileStorage,
  ResendMailer,
  S3FileStorage,
  SharpImageWatermarker,
  SystemClock,
  UuidV7IdGenerator,
  type Database,
  type DatabaseConnection,
} from '@norde/infra';
import { nextCookies } from 'better-auth/next-js';

import { getEnv, type Env } from './config/env';
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
  /** Mi empresa: configuración, códigos de referencia y gestor de archivos (#4). */
  readonly settings: SettingsUseCases;
}

export type SettingsUseCases = ReturnType<typeof createSettingsUseCases>;

let container: Container | undefined;

function createStorage(env: Env): FileStorage {
  if (env.STORAGE_DRIVER === 'local') return new LocalFileStorage(env.STORAGE_LOCAL_DIR);
  // `getEnv` ya exigió estas variables con STORAGE_DRIVER=s3.
  return new S3FileStorage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION ?? 'auto',
    bucket: env.S3_BUCKET ?? '',
    accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
  });
}

function createSettingsUseCases(
  db: Database,
  env: Env,
  deps: { readonly ids: IdGenerator; readonly clock: Clock },
) {
  const { ids, clock } = deps;
  const uow = createSettingsUnitOfWork(db, deps);
  const storage = createStorage(env);
  const settings = new DrizzleCompanySettingsRepository(db, clock);
  const files = new DrizzleCompanyFilesQuery(db);
  const directory = new DrizzleDirectory(db);
  const mailer = new ResendMailer({
    apiKey: env.RESEND_API_KEY,
    fromAddress: env.MAIL_FROM_ADDRESS,
    logger: getLogger(),
  });

  return {
    getCompanySettings: new GetCompanySettings({ settings }),
    getCompanyLogo: new GetCompanyLogo({ settings, storage }),
    updateGeneralSettings: new UpdateGeneralSettings({ uow, clock }),
    changeCompanyLogo: new ChangeCompanyLogo({ uow, storage, ids, clock }),
    configureWatermark: new ConfigureWatermark({ uow, clock }),
    changeWatermarkLogo: new ChangeWatermarkLogo({ uow, storage, ids, clock }),
    previewWatermark: new PreviewWatermark({
      settings,
      storage,
      watermarker: new SharpImageWatermarker(),
    }),
    updatePortalDescriptionFooter: new UpdatePortalDescriptionFooter({ uow, clock }),
    updatePdfOptions: new UpdatePdfOptions({ uow, clock }),
    updateEmailSender: new UpdateEmailSender({ uow, clock }),
    sendTestEmail: new SendTestEmail({ settings, mailer, uow }),
    listReferenceCodeSequences: new ListReferenceCodeSequences({
      sequences: new DrizzleReferenceCodeSequenceQuery(db),
      directory,
    }),
    searchDirectory: new SearchDirectory({ directory }),
    createReferenceCodeSequence: new CreateReferenceCodeSequence({ uow, ids }),
    changeReferenceCodePrefix: new ChangeReferenceCodePrefix({ uow }),
    deleteReferenceCodeSequence: new DeleteReferenceCodeSequence({ uow }),
    allocateReferenceCode: new AllocateReferenceCode({ uow }),
    listFolderContents: new ListFolderContents({ files }),
    listTrashedFiles: new ListTrashedFiles({ files }),
    getCompanyFileDownload: new GetCompanyFileDownload({
      files: new DrizzleCompanyFileRepository(db, clock),
      storage,
    }),
    createFolder: new CreateFolder({ uow, ids }),
    renameFolder: new RenameFolder({ uow }),
    deleteFolder: new DeleteFolder({ uow }),
    uploadCompanyFile: new UploadCompanyFile({ uow, storage, ids }),
    renameCompanyFile: new RenameCompanyFile({ uow }),
    moveCompanyFileToTrash: new MoveCompanyFileToTrash({ uow, clock }),
    restoreCompanyFile: new RestoreCompanyFile({ uow }),
  };
}

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
    settings: createSettingsUseCases(database.db, env, { ids, clock }),
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
