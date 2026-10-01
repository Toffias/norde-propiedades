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
  SearchDirectoryQuerySchema,
  type DirectoryEntry,
  type SearchDirectoryQuery,
} from '../../contracts';
import type { Directory } from '../ports/directory';
import { parseInput, type ValidationFailedError } from '../settings-input';

export type SearchDirectoryError = ForbiddenError | ValidationFailedError;

/** Buscador de usuarios, equipos o sucursales para elegir a quién aplica un prefijo exclusivo. */
export class SearchDirectory {
  constructor(private readonly deps: { readonly directory: Directory }) {}

  async execute(
    input: SearchDirectoryQuery,
    actor: Actor,
  ): Promise<Result<Page<DirectoryEntry>, SearchDirectoryError>> {
    if (!actor.can('settings:read')) return err({ type: 'Forbidden' });
    const parsed = parseInput(SearchDirectoryQuerySchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const query = parsed.value;

    const slice = await this.deps.directory.search({
      kind: query.kind,
      search: query.search === '' ? undefined : query.search,
      direction: query.sort.direction,
      ...toOffsetLimit(query),
    });
    return ok(toPage(slice, query));
  }
}
