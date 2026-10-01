import 'server-only';

// Composition root: único archivo de la app que importa @norde/infra.
// Arma los casos de uso de @norde/core que usan los Server Components y las Server Actions.

import { ResolveSessionActor } from '@norde/core/identity';
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
  BetterAuthSessionReader,
  createAuth,
  createDatabase,
  createSettingsUnitOfWork,
  DrizzleAuditLog,
  DrizzleCompanyFileRepository,
  DrizzleCompanyFilesQuery,
  DrizzleCompanySettingsRepository,
  DrizzleDirectory,
  DrizzleReferenceCodeSequenceQuery,
  DrizzleUserAccessQuery,
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

  return {
    database,
    ids,
    handleAuthRequest: (request) => auth.handler(request),
    sessions: new BetterAuthSessionReader(auth),
    resolveSessionActor: new ResolveSessionActor({
      users: new DrizzleUserAccessQuery(database.db),
    }),
    settings: createSettingsUseCases(database.db, env, { ids, clock }),
  };
}

/** Se crea al primer uso y se reutiliza durante toda la vida del proceso. */
export function getContainer(): Container {
  container ??= createContainer();
  return container;
}
