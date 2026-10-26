import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import type { NotificationQuery } from '../ports/notification-query';

/** El contador de la campana: cuántas notificaciones no leyó quien consulta. */
export class CountUnreadNotifications {
  constructor(private readonly deps: { readonly notifications: NotificationQuery }) {}

  async execute(actor: Actor): Promise<Result<{ readonly unread: number }, ForbiddenError>> {
    if (actor.kind !== 'user' || !actor.can('notifications:read')) {
      return err({ type: 'Forbidden' });
    }
    return ok({ unread: await this.deps.notifications.countUnread(actor.id) });
  }
}
