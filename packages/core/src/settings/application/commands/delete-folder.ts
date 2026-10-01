import {
  auditAction,
  diffChanges,
  err,
  ok,
  parseId,
  type Actor,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { FolderIdInputSchema, type FolderIdInput } from '../../contracts';
import type { FileFolderError } from '../../domain/file-folder';
import { folderAuditState, folderTarget } from '../company-files-audit';
import type { SettingsUnitOfWork } from '../ports/settings-transaction';
import { parseInput, type ValidationFailedError } from '../settings-input';

export type DeleteFolderError =
  ForbiddenError | ValidationFailedError | FileFolderError | { readonly type: 'FolderNotFound' };

/** Borra una carpeta vacía. Las carpetas no van a la papelera: se borran solo sin contenido. */
export class DeleteFolder {
  constructor(private readonly deps: { readonly uow: SettingsUnitOfWork }) {}

  async execute(input: FolderIdInput, actor: Actor): Promise<Result<void, DeleteFolderError>> {
    if (!actor.can('company-files:manage')) return err({ type: 'Forbidden' });
    const parsed = parseInput(FolderIdInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const id = parseId<'FileFolder'>(parsed.value.folderId);
    if (id.isErr()) return err({ type: 'FolderNotFound' });

    return this.deps.uow.run(async (tx): Promise<Result<void, DeleteFolderError>> => {
      const folder = await tx.folders.findById(id.value);
      if (!folder) return err({ type: 'FolderNotFound' });
      const removable = folder.ensureRemovable(await tx.folders.contents(folder.id));
      if (removable.isErr()) return err(removable.error);

      await tx.folders.delete(folder.id);
      await tx.audit.record(
        auditAction(
          actor,
          folderTarget(folder, 'file_folder.deleted'),
          diffChanges(folderAuditState(folder), {}),
        ),
      );
      return ok(undefined);
    });
  }
}
