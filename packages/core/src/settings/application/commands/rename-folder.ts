import {
  auditUpdated,
  err,
  ok,
  parseId,
  type Actor,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { RenameFolderInputSchema, type RenameFolderInput } from '../../contracts';
import {
  FileName,
  type FileFolderError,
  type InvalidFileNameError,
} from '../../domain/file-folder';
import { folderAuditState, folderTarget } from '../company-files-audit';
import type { SettingsUnitOfWork } from '../ports/settings-transaction';
import { parseInput, type ValidationFailedError } from '../settings-input';

export type RenameFolderError =
  | ForbiddenError
  | ValidationFailedError
  | InvalidFileNameError
  | FileFolderError
  | { readonly type: 'FolderNotFound' };

export class RenameFolder {
  constructor(private readonly deps: { readonly uow: SettingsUnitOfWork }) {}

  async execute(input: RenameFolderInput, actor: Actor): Promise<Result<void, RenameFolderError>> {
    if (!actor.can('company-files:manage')) return err({ type: 'Forbidden' });
    const parsed = parseInput(RenameFolderInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const id = parseId<'FileFolder'>(parsed.value.folderId);
    if (id.isErr()) return err({ type: 'FolderNotFound' });
    const name = FileName.create(parsed.value.name);
    if (name.isErr()) return err(name.error);

    return this.deps.uow.run(async (tx): Promise<Result<void, RenameFolderError>> => {
      const folder = await tx.folders.findById(id.value);
      if (!folder) return err({ type: 'FolderNotFound' });
      const before = folderAuditState(folder);
      const taken = await tx.folders.nameExists(folder.parentId, name.value, folder.id);
      const renamed = folder.rename(name.value, taken);
      if (renamed.isErr()) return err(renamed.error);

      const entry = auditUpdated(
        actor,
        folderTarget(folder, 'file_folder.renamed'),
        before,
        folderAuditState(folder),
      );
      if (!entry) return ok(undefined);
      await tx.folders.save(folder);
      await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}
