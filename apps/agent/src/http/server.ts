import Fastify from 'fastify';
import type { Logger } from 'pino';

import {
  registerWhatsAppWebhook,
  type WhatsAppWebhookOptions,
} from '../channels/whatsapp/webhook-routes';

import { registerHealthRoutes, type HealthCheck } from './routes/health';
import type { AppInstance } from './types';

export interface ServerDependencies {
  readonly logger: Logger;
  readonly healthCheck: HealthCheck;
  /** Sin configuración de WhatsApp, el webhook no se expone. */
  readonly whatsapp?: WhatsAppWebhookOptions | undefined;
}

export function buildServer(deps: ServerDependencies): AppInstance {
  const app = Fastify({
    loggerInstance: deps.logger,
    // Nginx, en el mismo servidor, es el único proxy delante del proceso.
    trustProxy: '127.0.0.1',
  });

  registerHealthRoutes(app, deps.healthCheck);
  if (deps.whatsapp) registerWhatsAppWebhook(app, deps.whatsapp);

  return app;
}
