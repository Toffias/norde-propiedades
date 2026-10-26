// API pública del módulo notifications (`@norde/core/notifications`): los avisos a cada usuario del
// panel en la campana de la barra superior, creados por reacciones a eventos de otros módulos.

export * from './contracts';
export {
  NOTIFICATION_TYPES,
  Notification,
  type NotificationId,
  type NotificationSnapshot,
  type NotificationType,
} from './domain/notification';
export { assignmentRecipient, type Assignment } from './domain/assignment-notice';
export type { NotificationRepository } from './domain/notification.repository';
export type { NotificationQuery } from './application/ports/notification-query';
export type { InvalidNotificationInputError } from './application/errors';
export {
  NotifyAssignment,
  type NotifyAssignmentError,
} from './application/handlers/notify-assignment';
export {
  RemoveErasedClientNotifications,
  type RemoveErasedClientNotificationsError,
} from './application/handlers/remove-erased-client-notifications';
export {
  MoveMergedClientNotifications,
  type MoveMergedClientNotificationsError,
} from './application/handlers/move-merged-client-notifications';
export {
  MarkNotificationRead,
  type MarkNotificationReadError,
} from './application/commands/mark-notification-read';
export { MarkAllNotificationsRead } from './application/commands/mark-all-notifications-read';
export {
  ListNotifications,
  type ListNotificationsError,
} from './application/queries/list-notifications';
export { CountUnreadNotifications } from './application/queries/count-unread-notifications';
