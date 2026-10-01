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
  ListFolderContentsQuerySchema,
  type FolderCrumb,
  type FolderEntry,
  type ListFolderContentsQuery,
} from '../../contracts';
import type { CompanyFilesQuery } from '../ports/company-files-query';
import { parseInput, type ValidationFailedError } from '../settings-input';

export type ListFolderContentsError =
  ForbiddenError | ValidationFailedError | { readonly type: 'FolderNotFound' };

export interface FolderContentsView {
  /** Ruta desde la raíz hasta la carpeta (vacía en la raíz). */
  readonly breadcrumb: readonly FolderCrumb[];
  readonly entries: Page<FolderEntry>;
}

/** Lo que hay en una carpeta del gestor: subcarpetas y archivos, paginado. */
export class ListFolderContents {
  constructor(private readonly deps: { readonly files: CompanyFilesQuery }) {}

  async execute(
    input: ListFolderContentsQuery,
    actor: Actor,
  ): Promise<Result<FolderContentsView, ListFolderContentsError>> {
    if (!actor.can('company-files:read')) return err({ type: 'Forbidden' });
    const parsed = parseInput(ListFolderContentsQuerySchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const query = parsed.value;

    const breadcrumb =
      query.folderId === undefined ? [] : await this.deps.files.breadcrumb(query.folderId);
    if (query.folderId !== undefined && breadcrumb.length === 0) {
      return err({ type: 'FolderNotFound' });
    }
    const slice = await this.deps.files.listFolder({
      folderId: query.folderId,
      sort: query.sort,
      ...toOffsetLimit(query),
    });
    return ok({ breadcrumb, entries: toPage(slice, query) });
  }
}
