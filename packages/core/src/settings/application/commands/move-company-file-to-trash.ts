import {
  auditAction,
  err,
  ok,
  parseId,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { FileIdInputSchema, type FileIdInput } from '../../contracts';
import type { CompanyFileError } from '../../domain/company-file';
import { fileTarget } from '../company-files-audit';
import type { SettingsUnitOfWork } from '../ports/settings-transaction';
import { parseInput, type ValidationFailedError } from '../settings-input';

export type MoveCompanyFileToTrashError =
  ForbiddenError | ValidationFailedError | CompanyFileError | { readonly type: 'FileNotFound' };

/** Manda un archivo a la papelera: deja de verse en su carpeta y se puede restaurar. */
export class MoveCompanyFileToTrash {
  constructor(private readonly deps: { readonly uow: SettingsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: FileIdInput,
    actor: Actor,
  ): Promise<Result<void, MoveCompanyFileToTrashError>> {
    if (!actor.can('company-files:manage')) return err({ type: 'Forbidden' });
    const parsed = parseInput(FileIdInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const id = parseId<'CompanyFile'>(parsed.value.fileId);
    if (id.isErr()) return err({ type: 'FileNotFound' });

    return this.deps.uow.run(async (tx): Promise<Result<void, MoveCompanyFileToTrashError>> => {
      const file = await tx.files.findById(id.value);
      if (!file) return err({ type: 'FileNotFound' });
      const trashed = file.moveToTrash(actor.id, this.deps.clock.now());
      if (trashed.isErr()) return err(trashed.error);

      await tx.files.save(file, actor.id);
      await tx.audit.record(auditAction(actor, fileTarget(file, 'company_file.deleted')));
      return ok(undefined);
    });
  }
}
