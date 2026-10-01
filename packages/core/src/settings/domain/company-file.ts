import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { FileFolderId, FileName } from './file-folder';

export type CompanyFileId = Id<'CompanyFile'>;

/** Tamaño máximo de un archivo subido al gestor: 25 MB. */
export const MAX_COMPANY_FILE_BYTES = 25 * 1024 * 1024;

/** Tipos de archivo que acepta el gestor: documentos, planillas, imágenes y comprimidos. */
export const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/zip',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export interface CompanyFileSnapshot {
  readonly id: CompanyFileId;
  readonly folderId: FileFolderId | undefined;
  readonly name: FileName;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  /** Usuario de identity que lo subió: solo el ID. */
  readonly uploadedBy: string;
  readonly deletedAt: Date | undefined;
  readonly deletedBy: string | undefined;
}

export type CompanyFileError =
  | { readonly type: 'FileTooLarge'; readonly maxBytes: number }
  | { readonly type: 'EmptyFile' }
  | { readonly type: 'FileTypeNotAllowed' }
  | { readonly type: 'FileAlreadyInTrash' }
  | { readonly type: 'FileNotInTrash' };

/** Solo un archivo en la papelera se saca de su carpeta (cuando se borra la carpeta). */
export interface FileNotInTrashError {
  readonly type: 'FileNotInTrash';
}

/** Archivo del gestor de la empresa (contratos modelo, manuales, planillas). Se borra a la papelera. */
export class CompanyFile extends AggregateRoot<CompanyFileId, never> {
  #state: Omit<CompanyFileSnapshot, 'id'>;

  private constructor(id: CompanyFileId, state: Omit<CompanyFileSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  /** Valida el archivo antes de subirlo al storage. */
  static validateUpload(file: {
    readonly mimeType: string;
    readonly sizeBytes: number;
  }): Result<void, CompanyFileError> {
    if (file.sizeBytes <= 0) return err({ type: 'EmptyFile' });
    if (file.sizeBytes > MAX_COMPANY_FILE_BYTES) {
      return err({ type: 'FileTooLarge', maxBytes: MAX_COMPANY_FILE_BYTES });
    }
    if (!ALLOWED_FILE_TYPES.some((type) => type === file.mimeType)) {
      return err({ type: 'FileTypeNotAllowed' });
    }
    return ok(undefined);
  }

  static upload(input: {
    readonly id: CompanyFileId;
    readonly folderId: FileFolderId | undefined;
    readonly name: FileName;
    readonly storageKey: string;
    readonly mimeType: string;
    readonly sizeBytes: number;
    readonly uploadedBy: string;
  }): Result<CompanyFile, CompanyFileError> {
    const valid = CompanyFile.validateUpload(input);
    if (valid.isErr()) return err(valid.error);
    const { id, ...state } = input;
    return ok(new CompanyFile(id, { ...state, deletedAt: undefined, deletedBy: undefined }));
  }

  static restore(snapshot: CompanyFileSnapshot): CompanyFile {
    const { id, ...state } = snapshot;
    return new CompanyFile(id, state);
  }

  get folderId(): FileFolderId | undefined {
    return this.#state.folderId;
  }

  get name(): FileName {
    return this.#state.name;
  }

  get storageKey(): string {
    return this.#state.storageKey;
  }

  get mimeType(): string {
    return this.#state.mimeType;
  }

  get sizeBytes(): number {
    return this.#state.sizeBytes;
  }

  get isInTrash(): boolean {
    return this.#state.deletedAt !== undefined;
  }

  rename(name: FileName): void {
    this.#state = { ...this.#state, name };
  }

  moveToTrash(by: string, now: Date): Result<void, CompanyFileError> {
    if (this.isInTrash) return err({ type: 'FileAlreadyInTrash' });
    this.#state = { ...this.#state, deletedAt: now, deletedBy: by };
    return ok(undefined);
  }

  /**
   * Se borra su carpeta: el archivo, que está en la papelera, pasa a la raíz. Si se restaura,
   * vuelve ahí.
   */
  detachFromFolder(): Result<void, FileNotInTrashError> {
    if (!this.isInTrash) return err({ type: 'FileNotInTrash' });
    this.#state = { ...this.#state, folderId: undefined };
    return ok(undefined);
  }

  restoreFromTrash(): Result<void, CompanyFileError> {
    if (!this.isInTrash) return err({ type: 'FileNotInTrash' });
    this.#state = { ...this.#state, deletedAt: undefined, deletedBy: undefined };
    return ok(undefined);
  }

  toSnapshot(): CompanyFileSnapshot {
    return { id: this.id, ...this.#state };
  }
}
