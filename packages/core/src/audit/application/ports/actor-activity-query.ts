import type { PageSlice } from '../../../shared';
import type { ActivityEntity, HistoryChange } from '../../contracts';
import type { ActivityEntityTypeFilter } from '../../domain/activity';

export interface ActorActivityCriteria {
  readonly actorId: string;
  /** Solo las entradas de estos tipos de entidad; `undefined`, todas. */
  readonly entityTypes: ActivityEntityTypeFilter | undefined;
  /** Desde, inclusive. */
  readonly from: Date | undefined;
  /** Hasta, exclusive. */
  readonly to: Date | undefined;
  readonly direction: 'asc' | 'desc';
  readonly offset: number;
  readonly limit: number;
}

export interface ActorActivityRecord {
  readonly id: string;
  readonly occurredAt: Date;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  /** Solo de las entidades que se saben nombrar (propiedad, contacto, oportunidad…). */
  readonly entity: ActivityEntity | undefined;
  readonly changes: Readonly<Record<string, HistoryChange>>;
}

/** Lo que hizo un usuario (`audit_log` por autor), con el nombre de cada entidad, paginado en la base. */
export interface ActorActivityQuery {
  list(criteria: ActorActivityCriteria): Promise<PageSlice<ActorActivityRecord>>;
}
