import { err, ok, parseId, type Actor, type ForbiddenError, type Result } from '../../../shared';
import { FileIdInputSchema, type FileContent, type FileIdInput } from '../../contracts';
import type { CompanyFileRepository } from '../../domain/settings.repository';
import type { FileStorage } from '../ports/file-storage';
import { parseInput, type ValidationFailedError } from '../settings-input';

export type GetCompanyFileDownloadError =
  ForbiddenError | ValidationFailedError | { readonly type: 'FileNotFound' };

/** El contenido de un archivo del gestor, para descargarlo. Los de la papelera no se descargan. */
export class GetCompanyFileDownload {
  constructor(
    private readonly deps: {
      readonly files: Pick<CompanyFileRepository, 'findById'>;
      readonly storage: FileStorage;
    },
  ) {}

  async execute(
    input: FileIdInput,
    actor: Actor,
  ): Promise<Result<FileContent, GetCompanyFileDownloadError>> {
    if (!actor.can('company-files:read')) return err({ type: 'Forbidden' });
    const parsed = parseInput(FileIdInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const id = parseId<'CompanyFile'>(parsed.value.fileId);
    if (id.isErr()) return err({ type: 'FileNotFound' });

    const file = await this.deps.files.findById(id.value);
    if (!file || file.isInTrash) return err({ type: 'FileNotFound' });
    const stored = await this.deps.storage.get(file.storageKey);
    // Registrado pero sin el objeto en el storage: no hay qué descargar.
    if (!stored) return err({ type: 'FileNotFound' });
    return ok({ fileName: file.name.value, contentType: file.mimeType, bytes: stored.bytes });
  }
}
