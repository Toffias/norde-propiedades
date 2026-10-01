import type { CompanyFile, CompanyFileId } from './company-file';
import type { CompanySettings } from './company-settings';
import type { FileFolder, FileFolderId, FileName, FolderContents } from './file-folder';
import type { ReferenceCodePrefix, ReferenceCodeScopeKey } from './reference-code';
import type { ReferenceCodeSequence, ReferenceCodeSequenceId } from './reference-code-sequence';

/** La fila única de configuración. Siempre existe: la crea la migración. */
export interface CompanySettingsRepository {
  get(): Promise<CompanySettings>;
  /** `actorId` queda como autor del cambio (`updated_by`). */
  save(settings: CompanySettings, actorId: string): Promise<void>;
}

export interface ReferenceCodeSequenceRepository {
  findById(id: ReferenceCodeSequenceId): Promise<ReferenceCodeSequence | undefined>;
  /** Las numeraciones configuradas para esos alcances (como mucho, una por alcance). */
  findByScopes(keys: readonly ReferenceCodeScopeKey[]): Promise<ReferenceCodeSequence[]>;
  findByPrefix(prefix: ReferenceCodePrefix): Promise<ReferenceCodeSequence | undefined>;
  save(sequence: ReferenceCodeSequence, actorId: string): Promise<void>;
  delete(id: ReferenceCodeSequenceId): Promise<void>;
  /**
   * Toma el próximo número de la numeración y la avanza, de forma atómica: dos altas en paralelo
   * nunca reciben el mismo número.
   */
  takeNextNumber(id: ReferenceCodeSequenceId): Promise<bigint>;
}

export interface FileFolderRepository {
  findById(id: FileFolderId): Promise<FileFolder | undefined>;
  /** Si existe otra carpeta con ese nombre en el mismo lugar (`undefined` es la raíz). */
  nameExists(
    parentId: FileFolderId | undefined,
    name: FileName,
    except?: FileFolderId,
  ): Promise<boolean>;
  contents(id: FileFolderId): Promise<FolderContents>;
  save(folder: FileFolder, actorId: string): Promise<void>;
  delete(id: FileFolderId): Promise<void>;
}

export interface CompanyFileRepository {
  findById(id: CompanyFileId): Promise<CompanyFile | undefined>;
  /** Hasta `limit` archivos de la papelera que todavía están en esa carpeta. */
  findTrashedIn(folderId: FileFolderId, limit: number): Promise<CompanyFile[]>;
  save(file: CompanyFile, actorId: string): Promise<void>;
}
