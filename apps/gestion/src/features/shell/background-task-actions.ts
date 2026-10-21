'use server';

import type { CountBackgroundTasksError, ListBackgroundTasksError } from '@norde/core/reporting';
import {
  CountBackgroundTasksQuerySchema,
  ListBackgroundTasksQuerySchema,
  type BackgroundTasksPage,
  type CountBackgroundTasksQuery,
  type ListBackgroundTasksQuery,
} from '@norde/core/reporting/contracts';
import { cookies } from 'next/headers';

import { getContainer } from '../../container';
import { messageForError, type ErrorMessages } from '../../lib/errors';
import { requireSession } from '../../lib/session';

import { BACKGROUND_TASKS_CLEARED_COOKIE, parseClearedAt } from './background-tasks';

const BACKGROUND_TASKS_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver los procesos de los demás.',
  InvalidInput: 'No pudimos leer el pedido. Volvé a intentar.',
} satisfies ErrorMessages<ListBackgroundTasksError | CountBackgroundTasksError>;

type Response<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

/** La campana de la barra: una página de procesos, sin los terminados que se limpiaron. */
export async function listBackgroundTasksAction(
  query: Omit<ListBackgroundTasksQuery, 'clearedAt'>,
): Promise<Response<BackgroundTasksPage>> {
  const { actor } = await requireSession();
  const clearedAt = parseClearedAt((await cookies()).get(BACKGROUND_TASKS_CLEARED_COOKIE)?.value);
  const parsed = ListBackgroundTasksQuerySchema.safeParse({ ...query, clearedAt });
  if (!parsed.success) {
    return { ok: false, message: BACKGROUND_TASKS_ERROR_MESSAGES.InvalidInput };
  }

  const result = await getContainer().backgroundTasks.list.execute(parsed.data, actor);
  if (result.isErr()) {
    return { ok: false, message: messageForError(result.error, BACKGROUND_TASKS_ERROR_MESSAGES) };
  }
  return { ok: true, value: result.value };
}

/** El contador de la campana, mientras el panel está cerrado. */
export async function countBackgroundTasksAction(
  query: CountBackgroundTasksQuery,
): Promise<Response<{ readonly active: number }>> {
  const { actor } = await requireSession();
  const parsed = CountBackgroundTasksQuerySchema.safeParse(query);
  if (!parsed.success) {
    return { ok: false, message: BACKGROUND_TASKS_ERROR_MESSAGES.InvalidInput };
  }

  const result = await getContainer().backgroundTasks.count.execute(parsed.data, actor);
  if (result.isErr()) {
    return { ok: false, message: messageForError(result.error, BACKGROUND_TASKS_ERROR_MESSAGES) };
  }
  return { ok: true, value: result.value };
}
