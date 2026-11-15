import * as Sentry from '@sentry/node';
import type { Breadcrumb, ErrorEvent } from '@sentry/node';

import type { Env } from './env';

// Errores inesperados del agente a Sentry (ADR 0055), con los mismos filtros que el panel (ADR
// 0049): ningún dato personal sale del país (Ley 25.326). El SDK no junta usuario, cookies,
// headers, bodies ni query strings, y el texto libre pasa por `scrubText`. Los mensajes de los
// contactos y las respuestas del modelo nunca van.

/** Una de cada diez requests lleva traza: alcanza para ver lentitud sin gastar la cuota gratis. */
const TRACES_SAMPLE_RATE = 0.1;

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
/** Teléfonos, DNI y CUIT: 7 dígitos o más, con o sin separadores. No toca los UUID. */
const DIGITS = /(?<![\w-])\+?\d[\d\s.-]{5,}\d(?![\w-])/g;
/** Query string de una URL (puede llevar el verify token de WhatsApp, o un teléfono). */
const QUERY_STRING = /\?[^\s#"']*/g;

export function scrubText(text: string): string {
  return text.replace(QUERY_STRING, '').replace(EMAIL, '[email]').replace(DIGITS, '[number]');
}

function scrubUnknown(value: unknown): unknown {
  return typeof value === 'string' ? scrubText(value) : value;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const data =
    breadcrumb.data === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(breadcrumb.data).map(([key, value]) => [key, scrubUnknown(value)]),
        );
  return {
    ...breadcrumb,
    ...(breadcrumb.message === undefined ? {} : { message: scrubText(breadcrumb.message) }),
    ...(data === undefined ? {} : { data }),
  };
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const { request } = event;
  return {
    ...event,
    ...(event.message === undefined ? {} : { message: scrubText(event.message) }),
    ...(event.exception?.values === undefined
      ? {}
      : {
          exception: {
            ...event.exception,
            values: event.exception.values.map((exception) => ({
              ...exception,
              ...(exception.value === undefined ? {} : { value: scrubText(exception.value) }),
            })),
          },
        }),
    ...(request === undefined
      ? {}
      : {
          request: {
            ...(request.method === undefined ? {} : { method: request.method }),
            ...(request.url === undefined ? {} : { url: scrubText(request.url) }),
          },
        }),
    ...(event.breadcrumbs === undefined
      ? {}
      : { breadcrumbs: event.breadcrumbs.map(scrubBreadcrumb) }),
  };
}

/** Inicia Sentry si hay DSN; sin él (desarrollo, tests, CI) no hace nada. */
export function initSentry(env: Pick<Env, 'SENTRY_DSN' | 'SENTRY_ENVIRONMENT'>): void {
  if (env.SENTRY_DSN === undefined) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    tracesSampleRate: TRACES_SAMPLE_RATE,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      genAI: { inputs: false, outputs: false },
      stackFrameVariables: false,
    },
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}
