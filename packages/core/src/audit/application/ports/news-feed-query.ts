import type { PageSlice } from '../../../shared';
import type { HistoryChange, NewsHeader } from '../../contracts';
import type { NewsEntityType, NewsKind } from '../../domain/news';

export interface NewsFeedCriteria {
  /** Solo las novedades de estos tipos (al menos uno). */
  readonly kinds: readonly NewsKind[];
  /** Solo las entidades de esta sucursal; `undefined`, todas. */
  readonly branchId: string | undefined;
  /** Sobre las tarjetas (entidad + día), no sobre las entradas. */
  readonly offset: number;
  readonly limit: number;
  /** Como mucho, estas entradas por tarjeta: las más nuevas. */
  readonly entriesPerCard: number;
}

export interface NewsEntryRecord {
  readonly id: string;
  readonly occurredAt: Date;
  readonly actorId: string;
  readonly action: string;
  readonly kind: NewsKind;
  readonly changes: Readonly<Record<string, HistoryChange>>;
}

export interface NewsCardRecord {
  readonly entityType: NewsEntityType;
  readonly entityId: string;
  /** `AAAA-MM-DD` en Buenos Aires. */
  readonly day: string;
  readonly header: NewsHeader | undefined;
  /** Las más nuevas primero. */
  readonly entries: readonly NewsEntryRecord[];
  /** Todas las novedades de la tarjeta, también las que no vinieron en `entries`. */
  readonly entryCount: number;
}

/**
 * El feed de Noticias sobre `audit_log`: agrupa las novedades por entidad y día (en Buenos Aires),
 * de la tarjeta con la novedad más reciente a la más vieja, y pagina las tarjetas en la base.
 */
export interface NewsFeedQuery {
  list(criteria: NewsFeedCriteria): Promise<PageSlice<NewsCardRecord>>;
}

/** El alcance de Noticias de la configuración de la empresa (settings). */
export interface NewsScopeReader {
  scope(): Promise<'branch' | 'all'>;
}

/** Nombres de usuarios del panel (identity), para el autor y el agente de cada novedad. */
export interface NewsUserNames {
  /** Como mucho, los de una página. Los que no existen no vuelven. */
  names(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
