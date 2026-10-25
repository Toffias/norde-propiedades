import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import type { NotificationRepository } from '../../domain/notification.repository';

/** "Marcar todas como leídas": las no leídas de quien consulta. */
export class MarkAllNotificationsRead {
  constructor(
    private readonly deps: {
      readonly notifications: NotificationRepository;
      readonly clock: Clock;
    },
  ) {}

  async execute(actor: Actor): Promise<Result<{ readonly marked: number }, ForbiddenError>> {
    if (actor.kind !== 'user' || !actor.can('notifications:read')) {
      return err({ type: 'Forbidden' });
    }
    const marked = await this.deps.notifications.markAllRead(actor.id, this.deps.clock.now());
    return ok({ marked });
  }
}
