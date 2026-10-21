import type { PageSlice } from '../../../shared';
import type { BackgroundTaskRow } from '../../contracts';

/** Sin el nombre de quien lo pidió: lo completa el caso de uso. */
export type BackgroundTaskRecord = Omit<BackgroundTaskRow, 'requester'> & {
  readonly requesterId: string;
};

export interface BackgroundTaskCriteria {
  /** Solo los que pidió este usuario; sin él, los de todos y los del sistema. */
  readonly requesterId: string | undefined;
  /** Las publicaciones en los portales no tienen quien las pidió: solo van con los de todos. */
  readonly includePortals: boolean;
  /** Los terminados antes de esto no vuelven; los en curso, siempre. */
  readonly finishedSince: Date;
}

/**
 * Los procesos en segundo plano: lee el estado que cada job deja en sus tablas (las fotos, las
 * importaciones, las acciones masivas, los PDF y las publicaciones), no la cola. Cruza tablas de
 * varios módulos (es un modelo de lectura de reporting). Los en curso van primero.
 */
export interface BackgroundTaskQuery {
  list(
    criteria: BackgroundTaskCriteria,
    request: {
      readonly direction: 'asc' | 'desc';
      readonly offset: number;
      readonly limit: number;
    },
  ): Promise<PageSlice<BackgroundTaskRecord>>;
  /** Los que siguen en espera o procesándose. */
  countActive(criteria: BackgroundTaskCriteria): Promise<number>;
}
