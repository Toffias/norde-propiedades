import {
  err,
  MergedClientInputSchema,
  ok,
  type Actor,
  type ForbiddenError,
  type MergedClientInput,
  type Result,
} from '../../../shared';
import type { NotificationRepository } from '../../domain/notification.repository';
import type { InvalidNotificationInputError } from '../errors';

export type MoveMergedClientNotificationsError = ForbiddenError | InvalidNotificationInputError;

/**
 * Reacción a `clients.clients_merged`: las notificaciones del duplicado pasan al contacto que
 * queda, así llevan a su ficha y se suprimen con él. Idempotente: una segunda vez no encuentra nada.
 */
export class MoveMergedClientNotifications {
  constructor(private readonly deps: { readonly notifications: NotificationRepository }) {}

  async execute(
    input: MergedClientInput,
    actor: Actor,
  ): Promise<Result<{ readonly moved: number }, MoveMergedClientNotificationsError>> {
    if (!actor.can('notifications:merge-client-data')) return err({ type: 'Forbidden' });
    const parsed = MergedClientInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'InvalidInput' });
    const { clientId, mergedClientId } = parsed.data;
    return ok({ moved: await this.deps.notifications.moveClient(mergedClientId, clientId) });
  }
}
