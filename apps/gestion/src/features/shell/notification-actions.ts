'use server';

import type { ListNotificationsError, MarkNotificationReadError } from '@norde/core/notifications';
import {
  ListNotificationsQuerySchema,
  MarkNotificationReadInputSchema,
  type ListNotificationsQuery,
  type MarkNotificationReadInput,
  type NotificationsPage,
} from '@norde/core/notifications/contracts';

import { getContainer } from '../../container';
import { messageForError, type ErrorMessages } from '../../lib/errors';
import { requireSession } from '../../lib/session';

const NOTIFICATIONS_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver las notificaciones.',
  InvalidInput: 'No pudimos leer el pedido. Volvé a intentar.',
  NotificationNotFound: 'Esa notificación ya no está.',
} satisfies ErrorMessages<ListNotificationsError | MarkNotificationReadError>;

type Response<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

/** La campana de la barra: una página de avisos de quien entra, con cuántos no leyó. */
export async function listNotificationsAction(
  query: ListNotificationsQuery,
): Promise<Response<NotificationsPage>> {
  const { actor } = await requireSession();
  const parsed = ListNotificationsQuerySchema.safeParse(query);
  if (!parsed.success) return { ok: false, message: NOTIFICATIONS_ERROR_MESSAGES.InvalidInput };

  const result = await getContainer().notifications.list.execute(parsed.data, actor);
  if (result.isErr()) {
    return { ok: false, message: messageForError(result.error, NOTIFICATIONS_ERROR_MESSAGES) };
  }
  return { ok: true, value: result.value };
}

/** El contador de la campana, mientras está cerrada. */
export async function countUnreadNotificationsAction(): Promise<
  Response<{ readonly unread: number }>
> {
  const { actor } = await requireSession();
  const result = await getContainer().notifications.countUnread.execute(actor);
  if (result.isErr()) {
    return { ok: false, message: messageForError(result.error, NOTIFICATIONS_ERROR_MESSAGES) };
  }
  return { ok: true, value: result.value };
}

/** Al abrir un aviso queda leído. */
export async function markNotificationReadAction(
  input: MarkNotificationReadInput,
): Promise<Response<undefined>> {
  const { actor } = await requireSession();
  const parsed = MarkNotificationReadInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: NOTIFICATIONS_ERROR_MESSAGES.InvalidInput };

  const result = await getContainer().notifications.markRead.execute(parsed.data, actor);
  if (result.isErr()) {
    return { ok: false, message: messageForError(result.error, NOTIFICATIONS_ERROR_MESSAGES) };
  }
  return { ok: true, value: undefined };
}

/** "Marcar todas como leídas". */
export async function markAllNotificationsReadAction(): Promise<
  Response<{ readonly marked: number }>
> {
  const { actor } = await requireSession();
  const result = await getContainer().notifications.markAllRead.execute(actor);
  if (result.isErr()) {
    return { ok: false, message: messageForError(result.error, NOTIFICATIONS_ERROR_MESSAGES) };
  }
  return { ok: true, value: result.value };
}
