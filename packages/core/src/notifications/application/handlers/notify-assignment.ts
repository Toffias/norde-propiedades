import {
  err,
  nextId,
  ok,
  type Actor,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { NotifyAssignmentInputSchema, type NotifyAssignmentInput } from '../../contracts';
import { assignmentRecipient } from '../../domain/assignment-notice';
import { Notification } from '../../domain/notification';
import type { NotificationRepository } from '../../domain/notification.repository';
import type { InvalidNotificationInputError } from '../errors';

export type NotifyAssignmentError = ForbiddenError | InvalidNotificationInputError;

/**
 * Reacción a las reasignaciones de clients (contacto, oportunidad, consulta): le avisa al agente
 * nuevo, salvo que no corresponda (`assignmentRecipient`). Idempotente: el mismo evento para el
 * mismo usuario se guarda una vez.
 */
export class NotifyAssignment {
  constructor(
    private readonly deps: {
      readonly notifications: NotificationRepository;
      readonly ids: IdGenerator;
    },
  ) {}

  async execute(
    input: NotifyAssignmentInput,
    actor: Actor,
  ): Promise<Result<{ readonly notified: boolean }, NotifyAssignmentError>> {
    if (!actor.can('notifications:create')) return err({ type: 'Forbidden' });
    const parsed = NotifyAssignmentInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'InvalidInput' });
    const { sourceEventId, type, entityId, clientId, occurredAt, ...assignment } = parsed.data;

    const userId = assignmentRecipient({
      type,
      fromAgentId: assignment.fromAgentId,
      toAgentId: assignment.toAgentId,
      assignedBy: assignment.assignedBy,
      inquiryId: assignment.inquiryId,
    });
    if (userId === undefined) return ok({ notified: false });

    const notification = Notification.create({
      id: nextId<'Notification'>(this.deps.ids),
      userId,
      type,
      entityId,
      clientIds: [clientId],
      sourceEventId,
      createdAt: occurredAt,
    });
    return ok({ notified: await this.deps.notifications.add(notification) });
  }
}
