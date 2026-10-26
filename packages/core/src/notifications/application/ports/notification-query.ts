import type { PageSlice } from '../../../shared';
import type { NotificationRow } from '../../contracts';

/**
 * Las notificaciones de un usuario para la campana, con el nombre de hoy del contacto de cada una
 * (lo lee de clients, como las Noticias).
 */
export interface NotificationQuery {
  list(
    userId: string,
    request: {
      readonly direction: 'asc' | 'desc';
      readonly offset: number;
      readonly limit: number;
    },
  ): Promise<PageSlice<NotificationRow>>;
  countUnread(userId: string): Promise<number>;
}
