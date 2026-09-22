// API pública de @norde/infra. Solo se importa desde el composition root de cada app.

export {
  createDatabase,
  type Database,
  type DatabaseConnection,
  type DatabaseOptions,
} from './db/client';
export { SystemClock } from './shared/system-clock';
export { UuidV7IdGenerator } from './shared/uuid-v7-id-generator';
