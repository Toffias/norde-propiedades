import type { Instrumentation } from 'next';

/**
 * Sentry en el servidor del sitio (ADR 0055). Next también compila este archivo para Edge; el
 * chequeo literal de `NEXT_RUNTIME` deja el SDK fuera de ese bundle. Sin `SENTRY_DSN`, no hace nada.
 */
export async function register(): Promise<void> {
  // eslint-disable-next-line no-restricted-syntax -- Next solo descarta el bundle Edge con este chequeo literal: es una constante del build, no configuración (ADR 0021).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initSentry } = await import('./config/sentry');
    initSentry();
  }
}

/** Los errores de renders y route handlers del servidor: van a Sentry, sin query string. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // eslint-disable-next-line no-restricted-syntax -- Ver `register`: constante del build.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(error, request, context);
};
