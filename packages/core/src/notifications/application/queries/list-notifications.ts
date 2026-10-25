import {
  err,
  ok,
  toOffsetLimit,
  type Actor,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import {
  ListNotificationsQuerySchema,
  type ListNotificationsQuery,
  type NotificationsPage,
} from '../../contracts';
import type { InvalidNotificationInputError } from '../errors';
import type { NotificationQuery } from '../ports/notification-query';

export type ListNotificationsError = ForbiddenError | InvalidNotificationInputError;

/** La campana: las notificaciones de quien consulta, paginadas, con cuántas no leyó. */
export class ListNotifications {
  constructor(private readonly deps: { readonly notifications: NotificationQuery }) {}

  async execute(
    input: ListNotificationsQuery,
    actor: Actor,
  ): Promise<Result<NotificationsPage, ListNotificationsError>> {
    if (actor.kind !== 'user' || !actor.can('notifications:read')) {
      return err({ type: 'Forbidden' });
    }
    const parsed = ListNotificationsQuerySchema.safeParse(input);
    if (!parsed.success) return err({ type: 'InvalidInput' });
    const { sort, ...page } = parsed.data;

    const [slice, unread] = await Promise.all([
      this.deps.notifications.list(actor.id, {
        direction: sort.direction,
        ...toOffsetLimit(page),
      }),
      this.deps.notifications.countUnread(actor.id),
    ]);
    return ok({ ...slice, page: page.page, pageSize: page.pageSize, unread });
  }
}
