import {
  err,
  ok,
  parseId,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { MarkNotificationReadInputSchema, type MarkNotificationReadInput } from '../../contracts';
import type { NotificationRepository } from '../../domain/notification.repository';
import type { InvalidNotificationInputError } from '../errors';

export type MarkNotificationReadError =
  ForbiddenError | InvalidNotificationInputError | { readonly type: 'NotificationNotFound' };

/** Quien la recibió la marca como leída (al abrirla). La de otro usuario no existe para él. */
export class MarkNotificationRead {
  constructor(
    private readonly deps: {
      readonly notifications: NotificationRepository;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: MarkNotificationReadInput,
    actor: Actor,
  ): Promise<Result<void, MarkNotificationReadError>> {
    if (actor.kind !== 'user' || !actor.can('notifications:read')) {
      return err({ type: 'Forbidden' });
    }
    const parsed = MarkNotificationReadInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'InvalidInput' });
    const id = parseId<'Notification'>(parsed.data.notificationId);
    if (id.isErr()) return err({ type: 'InvalidInput' });

    const notification = await this.deps.notifications.findById(id.value);
    if (!notification?.belongsTo(actor.id)) return err({ type: 'NotificationNotFound' });
    if (notification.markRead(this.deps.clock.now())) {
      await this.deps.notifications.save(notification);
    }
    return ok(undefined);
  }
}
