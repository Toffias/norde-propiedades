import {
  auditUpdated,
  err,
  ok,
  parseId,
  type Actor,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { RenameCompanyFileInputSchema, type RenameCompanyFileInput } from '../../contracts';
import { FileName, type InvalidFileNameError } from '../../domain/file-folder';
import { fileAuditState, fileTarget } from '../company-files-audit';
import type { SettingsUnitOfWork } from '../ports/settings-transaction';
import { parseInput, type ValidationFailedError } from '../settings-input';

export type RenameCompanyFileError =
  ForbiddenError | ValidationFailedError | InvalidFileNameError | { readonly type: 'FileNotFound' };

export class RenameCompanyFile {
  constructor(private readonly deps: { readonly uow: SettingsUnitOfWork }) {}

  async execute(
    input: RenameCompanyFileInput,
    actor: Actor,
  ): Promise<Result<void, RenameCompanyFileError>> {
    if (!actor.can('company-files:manage')) return err({ type: 'Forbidden' });
    const parsed = parseInput(RenameCompanyFileInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const id = parseId<'CompanyFile'>(parsed.value.fileId);
    if (id.isErr()) return err({ type: 'FileNotFound' });
    const name = FileName.create(parsed.value.name);
    if (name.isErr()) return err(name.error);

    return this.deps.uow.run(async (tx): Promise<Result<void, RenameCompanyFileError>> => {
      const file = await tx.files.findById(id.value);
      if (!file || file.isInTrash) return err({ type: 'FileNotFound' });
      const before = fileAuditState(file);
      file.rename(name.value);

      const entry = auditUpdated(
        actor,
        fileTarget(file, 'company_file.renamed'),
        before,
        fileAuditState(file),
      );
      if (!entry) return ok(undefined);
      await tx.files.save(file, actor.id);
      await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}
