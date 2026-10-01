import {
  auditCreated,
  err,
  nextId,
  ok,
  parseId,
  type Actor,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { UploadCompanyFileInputSchema, type UploadCompanyFileInput } from '../../contracts';
import { CompanyFile, type CompanyFileError } from '../../domain/company-file';
import { FileName, type FileFolderId, type InvalidFileNameError } from '../../domain/file-folder';
import { fileAuditState, fileTarget } from '../company-files-audit';
import type { FileStorage } from '../ports/file-storage';
import type { SettingsUnitOfWork } from '../ports/settings-transaction';
import { parseInput, type ValidationFailedError } from '../settings-input';

export type UploadCompanyFileError =
  | ForbiddenError
  | ValidationFailedError
  | InvalidFileNameError
  | CompanyFileError
  | { readonly type: 'FolderNotFound' };

/**
 * Sube un archivo al gestor: primero al storage (con una clave generada, nunca con el nombre del
 * archivo) y después lo registra. Si el registro falla, borra lo subido.
 */
export class UploadCompanyFile {
  constructor(
    private readonly deps: {
      readonly uow: SettingsUnitOfWork;
      readonly storage: FileStorage;
      readonly ids: IdGenerator;
    },
  ) {}

  async execute(
    input: UploadCompanyFileInput,
    actor: Actor,
  ): Promise<Result<{ readonly fileId: string }, UploadCompanyFileError>> {
    if (!actor.can('company-files:upload')) return err({ type: 'Forbidden' });
    const parsed = parseInput(UploadCompanyFileInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const data = parsed.value;
    const name = FileName.create(data.fileName);
    if (name.isErr()) return err(name.error);
    const valid = CompanyFile.validateUpload({
      mimeType: data.contentType,
      sizeBytes: data.bytes.byteLength,
    });
    if (valid.isErr()) return err(valid.error);
    let folderId: FileFolderId | undefined;
    if (data.folderId !== undefined) {
      const id = parseId<'FileFolder'>(data.folderId);
      if (id.isErr()) return err({ type: 'FolderNotFound' });
      folderId = id.value;
    }

    const id = nextId<'CompanyFile'>(this.deps.ids);
    const storageKey = `company-files/${id}`;
    await this.deps.storage.put({
      key: storageKey,
      contentType: data.contentType,
      bytes: data.bytes,
    });

    let result: Result<{ readonly fileId: string }, UploadCompanyFileError>;
    try {
      result = await this.deps.uow.run(
        async (tx): Promise<Result<{ readonly fileId: string }, UploadCompanyFileError>> => {
          if (folderId !== undefined && !(await tx.folders.findById(folderId))) {
            return err({ type: 'FolderNotFound' });
          }
          const uploaded = CompanyFile.upload({
            id,
            folderId,
            name: name.value,
            storageKey,
            mimeType: data.contentType,
            sizeBytes: data.bytes.byteLength,
            uploadedBy: actor.id,
          });
          if (uploaded.isErr()) return err(uploaded.error);
          const file = uploaded.value;

          await tx.files.save(file, actor.id);
          await tx.audit.record(
            auditCreated(actor, fileTarget(file, 'company_file.uploaded'), fileAuditState(file)),
          );
          return ok({ fileId: file.id });
        },
      );
    } catch (error) {
      await this.deps.storage.delete(storageKey);
      throw error;
    }
    if (result.isErr()) await this.deps.storage.delete(storageKey);
    return result;
  }
}
