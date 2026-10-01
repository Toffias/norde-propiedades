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
  ListReferenceCodeSequencesQuerySchema,
  type DirectoryScope,
  type ListReferenceCodeSequencesQuery,
  type ReferenceCodeSequenceRow,
} from '../../contracts';
import { ReferenceCode, ReferenceCodePrefix } from '../../domain/reference-code';
import type { Directory } from '../ports/directory';
import type { ReferenceCodeSequenceQuery } from '../ports/reference-code-sequence-query';
import { parseInput, type ValidationFailedError } from '../settings-input';

export type ListReferenceCodeSequencesError = ForbiddenError | ValidationFailedError;

function isDirectoryScope(scope: string): scope is DirectoryScope {
  return scope === 'user' || scope === 'team' || scope === 'branch';
}

/** Las numeraciones configuradas, con el próximo código de cada una y a quién aplica. */
export class ListReferenceCodeSequences {
  constructor(
    private readonly deps: {
      readonly sequences: ReferenceCodeSequenceQuery;
      readonly directory: Directory;
    },
  ) {}

  async execute(
    input: ListReferenceCodeSequencesQuery,
    actor: Actor,
  ): Promise<Result<Page<ReferenceCodeSequenceRow>, ListReferenceCodeSequencesError>> {
    if (!actor.can('settings:read')) return err({ type: 'Forbidden' });
    const parsed = parseInput(ListReferenceCodeSequencesQuerySchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const query = parsed.value;

    const slice = await this.deps.sequences.list({ ...toOffsetLimit(query), sort: query.sort });

    const names = new Map<string, string>();
    for (const kind of ['user', 'team', 'branch'] as const) {
      const ids = slice.items.filter((r) => r.scope === kind).map((r) => r.scopeValue);
      if (ids.length === 0) continue;
      for (const [id, name] of await this.deps.directory.names(kind, ids)) names.set(id, name);
    }

    const items = slice.items.map((record): ReferenceCodeSequenceRow => {
      const prefix = ReferenceCodePrefix.create(record.prefix);
      return {
        id: record.id,
        scope: record.scope,
        scopeValue: record.scopeValue,
        scopeName: isDirectoryScope(record.scope) ? names.get(record.scopeValue) : undefined,
        prefix: record.prefix,
        nextCode: prefix.isOk()
          ? ReferenceCode.format(prefix.value, record.nextNumber).value
          : record.prefix,
      };
    });
    return ok(toPage({ items, total: slice.total }, query));
  }
}
