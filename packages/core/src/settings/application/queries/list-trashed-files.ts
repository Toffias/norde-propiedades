import {
  err,
  ok,
  toOffsetLimit,
  toPage,
  type Actor,
  type ForbiddenError,
  type Page,
  type Result,
} from '../../../shared';
import {
  ListTrashedFilesQuerySchema,
  type ListTrashedFilesQuery,
  type TrashedFileRow,
} from '../../contracts';
import type { CompanyFilesQuery } from '../ports/company-files-query';
import { parseInput, type ValidationFailedError } from '../settings-input';

export type ListTrashedFilesError = ForbiddenError | ValidationFailedError;

/** La papelera del gestor de archivos. */
export class ListTrashedFiles {
  constructor(private readonly deps: { readonly files: CompanyFilesQuery }) {}

  async execute(
    input: ListTrashedFilesQuery,
    actor: Actor,
  ): Promise<Result<Page<TrashedFileRow>, ListTrashedFilesError>> {
    if (!actor.can('company-files:manage')) return err({ type: 'Forbidden' });
    const parsed = parseInput(ListTrashedFilesQuerySchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const query = parsed.value;

    const slice = await this.deps.files.listTrash({ sort: query.sort, ...toOffsetLimit(query) });
    return ok(toPage(slice, query));
  }
}
