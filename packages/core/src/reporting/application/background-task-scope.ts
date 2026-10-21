import { err, ok, type Actor, type ForbiddenError, type Result } from '../../shared';
import type { BackgroundTaskScope } from '../contracts';

import type { BackgroundTaskCriteria } from './ports/background-task-query';

export type BackgroundTaskScopeError = ForbiddenError;

/** Ver los procesos de los demás y los del sistema (las importaciones de Tokko, los portales). */
export const READ_OTHERS_BACKGROUND_TASKS = 'background-tasks:read-others';

/**
 * Qué alcanza a ver el actor. Cualquier usuario del panel ve los procesos que pidió; los de todos,
 * con las publicaciones en los portales, piden el permiso.
 */
export function backgroundTaskCriteria(
  scope: BackgroundTaskScope,
  actor: Actor,
  finishedSince: Date,
): Result<BackgroundTaskCriteria, ForbiddenError> {
  if (actor.kind !== 'user') return err({ type: 'Forbidden' });
  if (scope === 'mine') return ok({ requesterId: actor.id, includePortals: false, finishedSince });
  if (!actor.can(READ_OTHERS_BACKGROUND_TASKS)) return err({ type: 'Forbidden' });
  return ok({ requesterId: undefined, includePortals: true, finishedSince });
}
