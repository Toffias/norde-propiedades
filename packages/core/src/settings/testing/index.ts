// Fakes del módulo settings para tests (`@norde/core/settings/testing`).

import { err, ok, type PageSlice, type Result } from '../../shared';
import { InMemoryAuditLog, InMemoryEventPublisher } from '../../shared/testing';
import type {
  DirectoryEntry,
  DirectoryScope,
  FolderCrumb,
  FolderEntry,
  TrashedFileRow,
} from '../contracts';
import type { CompanyFilesQuery } from '../application/ports/company-files-query';
import type { CompanySettingsReader } from '../application/ports/company-settings-reader';
import type { Directory } from '../application/ports/directory';
import type { FileStorage, StoredObject } from '../application/ports/file-storage';
import type { ImageWatermarker, InvalidImageError } from '../application/ports/image-watermarker';
import type { Mailer, MailerError, OutgoingEmail } from '../application/ports/mailer';
import type {
  ReferenceCodeSequenceQuery,
  ReferenceCodeSequenceRecord,
} from '../application/ports/reference-code-sequence-query';
import type { ReferenceCodeUsage } from '../application/ports/reference-code-usage';
import type {
  SettingsTransaction,
  SettingsUnitOfWork,
} from '../application/ports/settings-transaction';
import { CompanyFile, type CompanyFileId, type CompanyFileSnapshot } from '../domain/company-file';
import { CompanySettings, type CompanySettingsSnapshot } from '../domain/company-settings';
import {
  FileFolder,
  type FileFolderId,
  type FileFolderSnapshot,
  type FileName,
} from '../domain/file-folder';
import type { ReferenceCodePrefix, ReferenceCodeScopeKey } from '../domain/reference-code';
import {
  ReferenceCodeSequence,
  type ReferenceCodeSequenceId,
  type ReferenceCodeSequenceSnapshot,
} from '../domain/reference-code-sequence';
import type {
  CompanyFileRepository,
  CompanySettingsRepository,
  FileFolderRepository,
  ReferenceCodeSequenceRepository,
} from '../domain/settings.repository';

export class InMemoryCompanySettingsRepository
  implements CompanySettingsRepository, CompanySettingsReader
{
  row: CompanySettingsSnapshot = CompanySettings.defaults().toSnapshot();

  get() {
    return Promise.resolve(CompanySettings.restore(this.row));
  }

  save(settings: CompanySettings) {
    this.row = settings.toSnapshot();
    return Promise.resolve();
  }
}

export class InMemoryReferenceCodeSequenceRepository
  implements ReferenceCodeSequenceRepository, ReferenceCodeSequenceQuery
{
  readonly rows = new Map<string, ReferenceCodeSequenceSnapshot>();

  findById(id: ReferenceCodeSequenceId) {
    const row = this.rows.get(id);
    return Promise.resolve(row && ReferenceCodeSequence.restore(row));
  }

  findByScopes(keys: readonly ReferenceCodeScopeKey[]) {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((r) => keys.some((k) => k.scope === r.scope && k.scopeValue === r.scopeValue))
        .map((r) => ReferenceCodeSequence.restore(r)),
    );
  }

  findByPrefix(prefix: ReferenceCodePrefix) {
    const row = [...this.rows.values()].find((r) => r.prefix.equals(prefix));
    return Promise.resolve(row && ReferenceCodeSequence.restore(row));
  }

  save(sequence: ReferenceCodeSequence) {
    const existing = this.rows.get(sequence.id);
    // El correlativo lo avanza solo `takeNextNumber`, como en la base.
    const snapshot = sequence.toSnapshot();
    this.rows.set(
      sequence.id,
      existing ? { ...snapshot, nextNumber: existing.nextNumber } : snapshot,
    );
    return Promise.resolve();
  }

  delete(id: ReferenceCodeSequenceId) {
    this.rows.delete(id);
    return Promise.resolve();
  }

  takeNextNumber(id: ReferenceCodeSequenceId) {
    const row = this.rows.get(id);
    if (!row) throw new Error(`Unknown sequence ${id}`);
    this.rows.set(id, { ...row, nextNumber: row.nextNumber + 1n });
    return Promise.resolve(row.nextNumber);
  }

  list(params: {
    readonly offset: number;
    readonly limit: number;
  }): Promise<PageSlice<ReferenceCodeSequenceRecord>> {
    const all = [...this.rows.values()].map((r) => ({
      id: r.id,
      scope: r.scope,
      scopeValue: r.scopeValue,
      prefix: r.prefix.value,
      nextNumber: r.nextNumber,
    }));
    return Promise.resolve({
      items: all.slice(params.offset, params.offset + params.limit),
      total: all.length,
    });
  }
}

export class InMemoryFileFolderRepository implements FileFolderRepository {
  readonly rows = new Map<string, FileFolderSnapshot>();

  constructor(private readonly files: InMemoryCompanyFileRepository) {}

  findById(id: FileFolderId) {
    const row = this.rows.get(id);
    return Promise.resolve(row && FileFolder.restore(row));
  }

  nameExists(parentId: FileFolderId | undefined, name: FileName, except?: FileFolderId) {
    return Promise.resolve(
      [...this.rows.values()].some(
        (r) => r.parentId === parentId && r.name.value === name.value && r.id !== except,
      ),
    );
  }

  contents(id: FileFolderId) {
    return Promise.resolve({
      folders: [...this.rows.values()].filter((r) => r.parentId === id).length,
      files: [...this.files.rows.values()].filter(
        (r) => r.folderId === id && r.deletedAt === undefined,
      ).length,
    });
  }

  save(folder: FileFolder) {
    this.rows.set(folder.id, folder.toSnapshot());
    return Promise.resolve();
  }

  delete(id: FileFolderId) {
    this.rows.delete(id);
    return Promise.resolve();
  }
}

export class InMemoryCompanyFileRepository implements CompanyFileRepository {
  readonly rows = new Map<string, CompanyFileSnapshot>();

  findById(id: CompanyFileId) {
    const row = this.rows.get(id);
    return Promise.resolve(row && CompanyFile.restore(row));
  }

  findTrashedIn(folderId: FileFolderId, limit: number) {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((r) => r.folderId === folderId && r.deletedAt !== undefined)
        .slice(0, limit)
        .map((r) => CompanyFile.restore(r)),
    );
  }

  save(file: CompanyFile) {
    this.rows.set(file.id, file.toSnapshot());
    return Promise.resolve();
  }
}

/**
 * Unidad de trabajo en memoria. Si el trabajo devuelve un `Err` o lanza, descarta lo escrito
 * (como el rollback de la implementación real).
 */
export class InMemorySettingsUnitOfWork implements SettingsUnitOfWork {
  readonly companySettings = new InMemoryCompanySettingsRepository();
  readonly sequences = new InMemoryReferenceCodeSequenceRepository();
  readonly files = new InMemoryCompanyFileRepository();
  readonly folders = new InMemoryFileFolderRepository(this.files);
  readonly codeUsage = new InMemoryReferenceCodeUsage();
  readonly events = new InMemoryEventPublisher();
  readonly audit = new InMemoryAuditLog();

  async run<T>(work: (tx: SettingsTransaction) => Promise<T>): Promise<T> {
    const backup = {
      settings: this.companySettings.row,
      sequences: new Map(this.sequences.rows),
      folders: new Map(this.folders.rows),
      files: new Map(this.files.rows),
      events: this.events.published.length,
      audit: this.audit.entries.length,
    };
    const restore = <K, V>(target: Map<K, V>, source: Map<K, V>) => {
      target.clear();
      for (const [k, v] of source) target.set(k, v);
    };
    const rollback = () => {
      this.companySettings.row = backup.settings;
      restore(this.sequences.rows, backup.sequences);
      restore(this.folders.rows, backup.folders);
      restore(this.files.rows, backup.files);
      this.events.published.splice(backup.events);
      this.audit.entries.splice(backup.audit);
    };

    try {
      const result = await work(this);
      if (isErrResult(result)) rollback();
      return result;
    } catch (error) {
      rollback();
      throw error;
    }
  }
}

function isErrResult(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === false;
}

export class InMemoryFileStorage implements FileStorage {
  readonly objects = new Map<string, StoredObject>();

  put(object: StoredObject) {
    this.objects.set(object.key, object);
    return Promise.resolve();
  }

  get(key: string) {
    return Promise.resolve(this.objects.get(key));
  }

  delete(key: string) {
    this.objects.delete(key);
    return Promise.resolve();
  }

  /** Con `signing`, firma como S3 (`signed:<clave>`); sin él, como el disco local. */
  signing = false;

  signedUrl(key: string) {
    return Promise.resolve(this.signing ? `signed:${key}` : undefined);
  }
}

export class RecordingMailer implements Mailer {
  readonly sent: OutgoingEmail[] = [];
  failWith: MailerError | undefined;

  send(email: OutgoingEmail): Promise<Result<void, MailerError>> {
    if (this.failWith) return Promise.resolve(err(this.failWith));
    this.sent.push(email);
    return Promise.resolve(ok(undefined));
  }
}

/** Devuelve la foto con un byte de marca al final; con `invalid`, falla como una imagen corrupta. */
export class FakeImageWatermarker implements ImageWatermarker {
  invalid = false;

  apply(input: { readonly photo: Uint8Array }): Promise<Result<Uint8Array, InvalidImageError>> {
    if (this.invalid) return Promise.resolve(err({ type: 'InvalidImage' }));
    return Promise.resolve(ok(new Uint8Array([...input.photo, 0xff])));
  }
}

export class InMemoryReferenceCodeUsage implements ReferenceCodeUsage {
  readonly taken = new Set<string>();

  isTaken(code: string) {
    return Promise.resolve(this.taken.has(code));
  }
}

export class InMemoryDirectory implements Directory {
  readonly entries: Record<DirectoryScope, DirectoryEntry[]> = { user: [], team: [], branch: [] };

  search(params: {
    readonly kind: DirectoryScope;
    readonly search: string | undefined;
    readonly offset: number;
    readonly limit: number;
  }): Promise<PageSlice<DirectoryEntry>> {
    const matches = this.entries[params.kind].filter(
      (e) =>
        params.search === undefined || e.name.toLowerCase().includes(params.search.toLowerCase()),
    );
    return Promise.resolve({
      items: matches.slice(params.offset, params.offset + params.limit),
      total: matches.length,
    });
  }

  names(kind: DirectoryScope, ids: readonly string[]) {
    return Promise.resolve(
      new Map(this.entries[kind].filter((e) => ids.includes(e.id)).map((e) => [e.id, e.name])),
    );
  }
}

/** Query del gestor sobre los repositorios en memoria. */
export class InMemoryCompanyFilesQuery implements CompanyFilesQuery {
  constructor(private readonly uow: InMemorySettingsUnitOfWork) {}

  listFolder(params: {
    readonly folderId: string | undefined;
    readonly offset: number;
    readonly limit: number;
  }): Promise<PageSlice<FolderEntry>> {
    const folders: FolderEntry[] = [...this.uow.folders.rows.values()]
      .filter((r) => r.parentId === params.folderId)
      .map((r) => ({ kind: 'folder', id: r.id, name: r.name.value, updatedAt: new Date(0) }));
    const files: FolderEntry[] = [...this.uow.files.rows.values()]
      .filter((r) => r.folderId === params.folderId && r.deletedAt === undefined)
      .map((r) => ({
        kind: 'file',
        id: r.id,
        name: r.name.value,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes,
        updatedAt: new Date(0),
      }));
    const all = [...folders, ...files];
    return Promise.resolve({
      items: all.slice(params.offset, params.offset + params.limit),
      total: all.length,
    });
  }

  listTrash(params: {
    readonly offset: number;
    readonly limit: number;
  }): Promise<PageSlice<TrashedFileRow>> {
    const all = [...this.uow.files.rows.values()].flatMap((r) =>
      r.deletedAt && r.deletedBy
        ? [
            {
              id: r.id,
              name: r.name.value,
              folderId: r.folderId,
              mimeType: r.mimeType,
              sizeBytes: r.sizeBytes,
              deletedAt: r.deletedAt,
              deletedBy: r.deletedBy,
            },
          ]
        : [],
    );
    return Promise.resolve({
      items: all.slice(params.offset, params.offset + params.limit),
      total: all.length,
    });
  }

  breadcrumb(folderId: string): Promise<FolderCrumb[]> {
    const folder = this.uow.folders.rows.get(folderId);
    if (!folder) return Promise.resolve([]);
    const ids = folder.path.split('/').filter((s) => s !== '');
    return Promise.resolve(
      ids.flatMap((id) => {
        const row = this.uow.folders.rows.get(id);
        return row ? [{ id: row.id, name: row.name.value }] : [];
      }),
    );
  }
}
