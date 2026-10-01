import type { Instrumentation } from 'next';

import { isNodeRuntime } from './config/env';

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
