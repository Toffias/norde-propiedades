import type { PageSlice } from '../../../shared';
import type { HistoryChange } from '../../contracts';

export interface AuditHistoryCriteria {
  readonly entityType: string;
  readonly entityId: string;
  /** Más estas entidades del mismo tipo (los contactos que se le unificaron). */
  readonly mergedEntityIds?: readonly string[] | undefined;
  /** Solo estas acciones (`property.status_changed`). */
  readonly actions: readonly string[] | undefined;
  /** Solo las entradas que tocan alguno de estos campos (`operations`). */
  readonly fields: readonly string[] | undefined;
  readonly actorId: string | undefined;
  /** Desde, inclusive. */
  readonly from: Date | undefined;
  /** Hasta, exclusive. */
  readonly to: Date | undefined;
  readonly direction: 'asc' | 'desc';
  readonly offset: number;
  readonly limit: number;
}

export interface AuditHistoryEntry {
  readonly id: string;
  readonly occurredAt: Date;
  readonly actorId: string;
  readonly source: string | undefined;
  readonly action: string;
  readonly changes: Readonly<Record<string, HistoryChange>>;
}

/** Lectura del historial de una entidad (`audit_log`), paginada en la base. */
export interface AuditHistoryQuery {
  list(criteria: AuditHistoryCriteria): Promise<PageSlice<AuditHistoryEntry>>;
}
