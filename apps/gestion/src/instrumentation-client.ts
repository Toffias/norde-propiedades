import * as Sentry from '@sentry/nextjs';

import { sentryOptions } from './config/sentry';

// Errores del navegador a Sentry (ADR 0049). Sin replay de sesión: grabaría la pantalla con datos
// de clientes.
Sentry.init(sentryOptions());

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
