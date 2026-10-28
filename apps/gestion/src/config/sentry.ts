import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs';

import { getPublicEnv } from './public-env';

// Opciones de Sentry comunes al servidor y al navegador (ADR 0049). Ningún dato personal sale del
// país (Ley 25.326): el SDK no junta usuario, cookies, headers, bodies ni query strings, y lo que
// queda de texto libre (mensajes de error, URLs, breadcrumbs) pasa por `scrubText`.

/** Una de cada diez requests lleva traza: alcanza para ver lentitud sin gastar la cuota gratis. */
const TRACES_SAMPLE_RATE = 0.1;

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
/** Teléfonos, DNI y CUIT: 7 dígitos o más, con o sin separadores. No toca los UUID. */
const DIGITS = /(?<![\w-])\+?\d[\d\s.-]{5,}\d(?![\w-])/g;
/** Query string de una URL (los filtros de las grillas pueden llevar un teléfono buscado). */
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

/** Lo común de `Sentry.init`. Sin DSN (desarrollo, tests, CI), el SDK queda apagado. */
export function sentryOptions() {
  const env = getPublicEnv();
  return {
    ...(env.NEXT_PUBLIC_SENTRY_DSN === undefined ? {} : { dsn: env.NEXT_PUBLIC_SENTRY_DSN }),
    enabled: env.NEXT_PUBLIC_SENTRY_DSN !== undefined,
    environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
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
  };
}
