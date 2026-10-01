import 'server-only';

import type { SessionActor } from '@norde/core/identity';
import { Actor, err, ok, type Result } from '@norde/core/shared';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { getContainer } from '../container';

/** Solo puede resolver sesiones: no ejecuta nada en nombre de nadie. */
const AUTH_ACTOR = Actor.system('auth', ['sessions:resolve']);

/** Por qué no hay una sesión válida: sin sesión (o vencida) o usuario suspendido. */
export type SessionProblem = { readonly type: 'NoSession' } | { readonly type: 'UserSuspended' };

/** Query param del login con el motivo por el que se volvió ahí. */
export const SIGN_IN_REASON_PARAM = 'motivo';
export const SUSPENDED_REASON = 'suspendido';

/**
 * Sesión del request actual (una sola consulta por request, con `cache`): el `Actor` con los
 * permisos efectivos y el perfil del usuario.
 */
export const getSession = cache(async (): Promise<Result<SessionActor, SessionProblem>> => {
  // `headers()` primero: marca la ruta como dinámica antes de tocar la base (el build no tiene).
  const requestHeaders = await headers();
  const container = getContainer();
  const userId = await container.sessions.currentUserId(requestHeaders);
  if (userId === undefined) return err({ type: 'NoSession' });

  const result = await container.resolveSessionActor.execute(
    { userId, correlationId: container.ids.next() },
    AUTH_ACTOR,
  );
  if (result.isOk()) return ok(result.value);

  switch (result.error.type) {
    case 'UserSuspended':
      return err({ type: 'UserSuspended' });
    case 'UserNotFound':
      return err({ type: 'NoSession' });
    case 'Forbidden':
      // El actor de auth siempre tiene el permiso: si no lo tiene, es un bug.
      throw new Error('The auth actor is not allowed to resolve sessions');
  }
});

/**
 * Para toda pantalla y Server Action bajo `(panel)`: sin sesión válida vuelve al login. La
 * autorización de cada acción la sigue decidiendo el caso de uso con el `Actor`.
 */
export async function requireSession(): Promise<SessionActor> {
  const session = await getSession();
  if (session.isOk()) return session.value;
  redirect(
    session.error.type === 'UserSuspended'
      ? `/ingresar?${SIGN_IN_REASON_PARAM}=${SUSPENDED_REASON}`
      : '/ingresar',
  );
}
