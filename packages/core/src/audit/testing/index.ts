// Fakes del módulo audit para tests (`@norde/core/audit/testing`).

import type {
  ActorActivityCriteria,
  ActorActivityQuery,
  ActorActivityRecord,
} from '../application/ports/actor-activity-query';
import type {
  AuditHistoryCriteria,
  AuditHistoryEntry,
  AuditHistoryQuery,
} from '../application/ports/audit-history-query';
import type {
  NewsActivityCriteria,
  NewsCardRecord,
  NewsDayRange,
  NewsFeedCriteria,
  NewsFeedQuery,
  NewsScopeReader,
  NewsUserNames,
} from '../application/ports/news-feed-query';
import type { NewsHeader } from '../contracts';
import { newsKindOf, type NewsEntityType } from '../domain/news';

export interface InMemoryNewsEntry extends AuditHistoryEntry {
  readonly entityType: NewsEntityType;
  readonly entityId: string;
}

/** `AAAA-MM-DD` en Buenos Aires (UTC−3, sin horario de verano). */
function dayInBuenosAires(at: Date): string {
  return new Date(at.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function inRange(day: string, days: NewsDayRange | undefined): boolean {
  return days === undefined || (day >= days.from && day <= days.to);
}

/** Clasifica, agrupa y pagina en memoria lo que `DrizzleNewsFeedQuery` hace en la base. */
export class InMemoryNewsFeedQuery implements NewsFeedQuery {
  readonly criteria: NewsFeedCriteria[] = [];
  readonly activityCriteria: NewsActivityCriteria[] = [];

  constructor(
    readonly entries: InMemoryNewsEntry[] = [],
    /** Cabecera y sucursal de cada entidad, por ID. */
    readonly entities: Map<
      string,
      { readonly header: NewsHeader; readonly branchId: string | undefined }
    > = new Map(),
  ) {}

  list(criteria: NewsFeedCriteria) {
    this.criteria.push(criteria);
    const cards = new Map<string, NewsCardRecord & { entries: NewsCardRecord['entries'] }>();
    const sorted = [...this.entries].sort(
      (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
    );
    for (const entry of sorted) {
      const kind = newsKindOf(entry.action, entry.changes);
      if (kind === undefined || !criteria.kinds.includes(kind)) continue;
      const entity = this.entities.get(entry.entityId);
      if (criteria.branchId !== undefined && entity?.branchId !== criteria.branchId) continue;
      const day = dayInBuenosAires(entry.occurredAt);
      if (!inRange(day, criteria.days)) continue;
      const key = `${entry.entityType}|${entry.entityId}|${day}`;
      const card = cards.get(key) ?? {
        entityType: entry.entityType,
        entityId: entry.entityId,
        day,
        header: entity?.header,
        entries: [],
        entryCount: 0,
      };
      cards.set(key, {
        ...card,
        entries:
          card.entries.length < criteria.entriesPerCard
            ? [...card.entries, { ...entry, kind }]
            : card.entries,
        entryCount: card.entryCount + 1,
      });
    }
    const all = [...cards.values()];
    return Promise.resolve({
      items: all.slice(criteria.offset, criteria.offset + criteria.limit),
      total: all.length,
    });
  }

  dailyCounts(criteria: NewsActivityCriteria) {
    this.activityCriteria.push(criteria);
    const cards = new Map<string, string>();
    for (const entry of this.entries) {
      const kind = newsKindOf(entry.action, entry.changes);
      if (kind === undefined || !criteria.kinds.includes(kind)) continue;
      const entity = this.entities.get(entry.entityId);
      if (criteria.branchId !== undefined && entity?.branchId !== criteria.branchId) continue;
      const day = dayInBuenosAires(entry.occurredAt);
      if (!inRange(day, criteria.days)) continue;
      cards.set(`${entry.entityType}|${entry.entityId}|${day}|${kind}`, day);
    }
    const counts = new Map<string, number>();
    for (const day of cards.values()) counts.set(day, (counts.get(day) ?? 0) + 1);
    return Promise.resolve(
      [...counts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, count]) => ({ day, count })),
    );
  }
}

export class FixedNewsScope implements NewsScopeReader {
  constructor(public value: 'branch' | 'all' = 'all') {}

  scope() {
    return Promise.resolve(this.value);
  }
}

export class InMemoryNewsUserNames implements NewsUserNames {
  readonly requested: string[][] = [];

  constructor(private readonly users: ReadonlyMap<string, string> = new Map()) {}

  names(ids: readonly string[]) {
    this.requested.push([...ids]);
    return Promise.resolve(
      new Map(
        ids.flatMap((id) => {
          const name = this.users.get(id);
          return name === undefined ? [] : [[id, name] as const];
        }),
      ),
    );
  }
}

/** Filtra y pagina en memoria lo que el SQL hace en la base: alcanza para probar los casos de uso. */
export class InMemoryAuditHistoryQuery implements AuditHistoryQuery {
  readonly criteria: AuditHistoryCriteria[] = [];

  constructor(
    readonly entries: (AuditHistoryEntry & {
      readonly entityType: string;
      readonly entityId: string;
    })[] = [],
  ) {}

  list(criteria: AuditHistoryCriteria) {
    this.criteria.push(criteria);
    const rows = this.entries
      .filter(
        (entry) =>
          entry.entityType === criteria.entityType &&
          (entry.entityId === criteria.entityId ||
            (criteria.mergedEntityIds ?? []).includes(entry.entityId)) &&
          (criteria.actions === undefined || criteria.actions.includes(entry.action)) &&
          (criteria.fields === undefined ||
            criteria.fields.some((field) => field in entry.changes)) &&
          (criteria.actorId === undefined || entry.actorId === criteria.actorId) &&
          (criteria.from === undefined || entry.occurredAt >= criteria.from) &&
          (criteria.to === undefined || entry.occurredAt < criteria.to),
      )
      .sort((a, b) =>
        criteria.direction === 'asc'
          ? a.occurredAt.getTime() - b.occurredAt.getTime()
          : b.occurredAt.getTime() - a.occurredAt.getTime(),
      );
    return Promise.resolve({
      items: rows.slice(criteria.offset, criteria.offset + criteria.limit),
      total: rows.length,
    });
  }
}

/** Filtra y pagina en memoria lo que el SQL hace en la base, por autor. */
export class InMemoryActorActivityQuery implements ActorActivityQuery {
  readonly criteria: ActorActivityCriteria[] = [];

  constructor(readonly entries: (ActorActivityRecord & { readonly actorId: string })[] = []) {}

  list(criteria: ActorActivityCriteria) {
    this.criteria.push(criteria);
    const types = criteria.entityTypes;
    const rows = this.entries
      .filter(
        (entry) =>
          entry.actorId === criteria.actorId &&
          (types === undefined ||
            ('include' in types
              ? types.include.includes(entry.entityType)
              : !types.exclude.includes(entry.entityType))) &&
          (criteria.from === undefined || entry.occurredAt >= criteria.from) &&
          (criteria.to === undefined || entry.occurredAt < criteria.to),
      )
      .sort((a, b) =>
        criteria.direction === 'asc'
          ? a.occurredAt.getTime() - b.occurredAt.getTime()
          : b.occurredAt.getTime() - a.occurredAt.getTime(),
      );
    return Promise.resolve({
      items: rows
        .slice(criteria.offset, criteria.offset + criteria.limit)
        .map(({ actorId: _actorId, ...record }) => record),
      total: rows.length,
    });
  }
}
