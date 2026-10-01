import {
  auditAction,
  auditUpdated,
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
import { fileAuditState, fileTarget, folderAuditState, folderTarget } from '../company-files-audit';
import type { SettingsUnitOfWork } from '../ports/settings-transaction';
import { parseInput, type ValidationFailedError } from '../settings-input';

export type DeleteFolderError =
  ForbiddenError | ValidationFailedError | FileFolderError | { readonly type: 'FolderNotFound' };

/** De a cuántos se mueven a la raíz los archivos de la papelera de una carpeta borrada. */
const TRASH_BATCH = 100;

/**
 * Borra una carpeta vacía (las carpetas no van a la papelera). Sus archivos en la papelera pasan a
 * la raíz, por lotes, cada uno con su entrada en el historial.
 */
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

      for (;;) {
        const batch = await tx.files.findTrashedIn(folder.id, TRASH_BATCH);
        if (batch.length === 0) break;
        for (const file of batch) {
          const before = fileAuditState(file);
          const detached = file.detachFromFolder();
          if (detached.isErr()) return err({ type: 'FolderNotEmpty' });
          await tx.files.save(file, actor.id);
          const entry = auditUpdated(
            actor,
            fileTarget(file, 'company_file.moved'),
            before,
            fileAuditState(file),
          );
          if (entry) await tx.audit.record(entry);
        }
      }

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
