import type { Instrumentation } from 'next';

import { isNodeRuntime } from './config/env';

/**
 * Arranque del servidor: el relay del outbox y los workers de pg-boss corren en este proceso
 * (ADR 0021). Next también compila este archivo para Edge; el chequeo literal de `NEXT_RUNTIME`
 * es lo único que deja ese código fuera de ese bundle.
 */
export async function register(): Promise<void> {
  // eslint-disable-next-line no-restricted-syntax -- Next solo descarta el bundle Edge con este chequeo literal: es una constante del build, no configuración (ADR 0021).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startJobsInProcess } = await import('./jobs/start-in-process');
    await startJobsInProcess();
  }
}

/**
 * Borde de los errores inesperados del servidor (renders, Server Actions, route handlers): se
 * loguean acá y la UI muestra un mensaje genérico (`error.tsx`, `global-error.tsx`). La ruta va
 * sin query string: los filtros pueden tener datos personales (un teléfono buscado).
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (!isNodeRuntime()) return;
  const { getLogger } = await import('./config/logger');
  getLogger().error(
    {
      err: error,
      method: request.method,
      path: request.path.split('?')[0],
      routePath: context.routePath,
      routeType: context.routeType,
    },
    'Unexpected error while handling a request',
  );
};
