import type { TokkoUsersImport, TokkoUsersImportId } from './tokko-users-import';

export interface TokkoUsersImportRepository {
  findById(id: TokkoUsersImportId): Promise<TokkoUsersImport | undefined>;
  /** `actorId` queda como autor del alta o de la edición (`created_by` / `updated_by`). */
  save(job: TokkoUsersImport, actorId: string): Promise<void>;
}
