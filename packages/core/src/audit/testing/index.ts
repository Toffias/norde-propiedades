// Fakes del módulo audit para tests (`@norde/core/audit/testing`).

import type {
  AuditHistoryCriteria,
  AuditHistoryEntry,
  AuditHistoryQuery,
} from '../application/ports/audit-history-query';

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
