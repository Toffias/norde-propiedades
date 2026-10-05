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
  NEWS_ENTRIES_PER_CARD,
  NewsFeedQuerySchema,
  type NewsCard,
  type ListNewsQuery,
} from '../../contracts';
import type {
  NewsEntryRecord,
  NewsFeedQuery,
  NewsScopeReader,
  NewsUserNames,
} from '../ports/news-feed-query';

export interface InvalidNewsQueryError {
  readonly type: 'InvalidInput';
  readonly issues: readonly string[];
}

export type ListNewsError = ForbiddenError | InvalidNewsQueryError;

/** El agente que recibió un contacto reasignado, del diff de la reasignación. */
function assigneeOf(entry: NewsEntryRecord): string | undefined {
  if (entry.kind !== 'client.reassigned') return undefined;
  const after = entry.changes.agentId?.after;
  return typeof after === 'string' ? after : undefined;
}

/**
 * Noticias: el feed de actividad de la empresa, por entidad y día, de lo más nuevo a lo más viejo.
 * Pide `news:read`. Según la configuración de la empresa, se ven las novedades de todas las
 * sucursales o solo las de la sucursal de quien mira (un usuario sin sucursal ve todas).
 */
export class ListNews {
  constructor(
    private readonly deps: {
      readonly feed: NewsFeedQuery;
      readonly settings: NewsScopeReader;
      readonly users: NewsUserNames;
    },
  ) {}

  async execute(
    input: ListNewsQuery,
    actor: Actor,
  ): Promise<Result<Page<NewsCard>, ListNewsError>> {
    if (!actor.can('news:read')) return err({ type: 'Forbidden' });
    const parsed = NewsFeedQuerySchema.safeParse(input);
    if (!parsed.success) {
      return err({
        type: 'InvalidInput',
        issues: parsed.error.issues.map((issue) => issue.message),
      });
    }
    const { page, pageSize, kinds } = parsed.data;
    if (kinds.length === 0) return ok(toPage({ items: [], total: 0 }, { page, pageSize }));

    const scope = await this.deps.settings.scope();
    const slice = await this.deps.feed.list({
      kinds,
      branchId: scope === 'branch' ? actor.branchId : undefined,
      entriesPerCard: NEWS_ENTRIES_PER_CARD,
      ...toOffsetLimit({ page, pageSize }),
    });

    const entries = slice.items.flatMap((card) => card.entries);
    const ids = new Set(entries.map((entry) => entry.actorId));
    for (const entry of entries) {
      const assignee = assigneeOf(entry);
      if (assignee !== undefined) ids.add(assignee);
    }
    const names =
      ids.size === 0 ? new Map<string, string>() : await this.deps.users.names([...ids]);

    const items = slice.items.map((card) => ({
      entityType: card.entityType,
      entityId: card.entityId,
      day: card.day,
      header: card.header,
      moreCount: Math.max(0, card.entryCount - card.entries.length),
      entries: card.entries.map((entry) => {
        const assignee = assigneeOf(entry);
        return {
          id: entry.id,
          occurredAt: entry.occurredAt,
          kind: entry.kind,
          action: entry.action,
          actor: { id: entry.actorId, name: names.get(entry.actorId) },
          assignee:
            assignee === undefined ? undefined : { id: assignee, name: names.get(assignee) },
          changes: entry.changes,
        };
      }),
    }));
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
