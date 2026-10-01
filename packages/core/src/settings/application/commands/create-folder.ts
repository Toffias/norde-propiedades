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
import { CreateFolderInputSchema, type CreateFolderInput } from '../../contracts';
import {
  FileFolder,
  FileName,
  type FileFolderError,
  type FileFolderId,
  type InvalidFileNameError,
} from '../../domain/file-folder';
import { folderAuditState, folderTarget } from '../company-files-audit';
import type { SettingsUnitOfWork } from '../ports/settings-transaction';
import { parseInput, type ValidationFailedError } from '../settings-input';

export type CreateFolderError =
  | ForbiddenError
  | ValidationFailedError
  | InvalidFileNameError
  | FileFolderError
  | { readonly type: 'FolderNotFound' };

/** Crea una carpeta en la raíz o dentro de otra. */
export class CreateFolder {
  constructor(
    private readonly deps: { readonly uow: SettingsUnitOfWork; readonly ids: IdGenerator },
  ) {}

  async execute(
    input: CreateFolderInput,
    actor: Actor,
  ): Promise<Result<{ readonly folderId: string }, CreateFolderError>> {
    if (!actor.can('company-files:manage')) return err({ type: 'Forbidden' });
    const parsed = parseInput(CreateFolderInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const name = FileName.create(parsed.value.name);
    if (name.isErr()) return err(name.error);
    let parentId: FileFolderId | undefined;
    if (parsed.value.parentId !== undefined) {
      const id = parseId<'FileFolder'>(parsed.value.parentId);
      if (id.isErr()) return err({ type: 'FolderNotFound' });
      parentId = id.value;
    }

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly folderId: string }, CreateFolderError>> => {
        const parent = parentId === undefined ? undefined : await tx.folders.findById(parentId);
        if (parentId !== undefined && !parent) return err({ type: 'FolderNotFound' });
        const created = FileFolder.create({
          id: nextId<'FileFolder'>(this.deps.ids),
          parent,
          name: name.value,
          nameTaken: await tx.folders.nameExists(parent?.id, name.value),
        });
        if (created.isErr()) return err(created.error);
        const folder = created.value;

        await tx.folders.save(folder);
        await tx.audit.record(
          auditCreated(
            actor,
            folderTarget(folder, 'file_folder.created'),
            folderAuditState(folder),
          ),
        );
        return ok({ folderId: folder.id });
      },
    );
  }
}
