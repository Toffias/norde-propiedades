import {
  ErasedClientsInputSchema,
  err,
  ok,
  type Actor,
  type ErasedClientsInput,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import type { NotificationRepository } from '../../domain/notification.repository';
import type { InvalidNotificationInputError } from '../errors';

export type RemoveErasedClientNotificationsError = ForbiddenError | InvalidNotificationInputError;

/**
 * Reacción a `clients.client_erased`: se borran las notificaciones que hablan del cliente
 * suprimido. Idempotente; no se audita: la constancia de la supresión la deja clients.
 */
export class RemoveErasedClientNotifications {
  constructor(private readonly deps: { readonly notifications: NotificationRepository }) {}

  async execute(
    input: ErasedClientsInput,
    actor: Actor,
  ): Promise<Result<{ readonly removed: number }, RemoveErasedClientNotificationsError>> {
    if (!actor.can('notifications:erase-client-data')) return err({ type: 'Forbidden' });
    const parsed = ErasedClientsInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'InvalidInput' });
    return ok({ removed: await this.deps.notifications.removeClients(parsed.data.clientIds) });
  }
}
