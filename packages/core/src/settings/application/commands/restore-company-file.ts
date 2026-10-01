import {
  auditAction,
  err,
  ok,
  parseId,
  type Actor,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { FileIdInputSchema, type FileIdInput } from '../../contracts';
import type { CompanyFileError } from '../../domain/company-file';
import { fileTarget } from '../company-files-audit';
import type { SettingsUnitOfWork } from '../ports/settings-transaction';
import { parseInput, type ValidationFailedError } from '../settings-input';

export type RestoreCompanyFileError =
  ForbiddenError | ValidationFailedError | CompanyFileError | { readonly type: 'FileNotFound' };

/** Saca un archivo de la papelera y lo vuelve a su carpeta. */
export class RestoreCompanyFile {
  constructor(private readonly deps: { readonly uow: SettingsUnitOfWork }) {}

  async execute(input: FileIdInput, actor: Actor): Promise<Result<void, RestoreCompanyFileError>> {
    if (!actor.can('company-files:manage')) return err({ type: 'Forbidden' });
    const parsed = parseInput(FileIdInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const id = parseId<'CompanyFile'>(parsed.value.fileId);
    if (id.isErr()) return err({ type: 'FileNotFound' });

    return this.deps.uow.run(async (tx): Promise<Result<void, RestoreCompanyFileError>> => {
      const file = await tx.files.findById(id.value);
      if (!file) return err({ type: 'FileNotFound' });
      const restored = file.restoreFromTrash();
      if (restored.isErr()) return err(restored.error);

      await tx.files.save(file);
      await tx.audit.record(auditAction(actor, fileTarget(file, 'company_file.restored')));
      return ok(undefined);
    });
  }
}
