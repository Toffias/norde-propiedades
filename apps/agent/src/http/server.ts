import Fastify from 'fastify';
import type { Logger } from 'pino';

import {
  registerWebChatRoutes,
  type WebChatRouteOptions,
} from '../channels/web-chat/web-chat-routes';
import {
  registerWhatsAppWebhook,
  type WhatsAppWebhookOptions,
} from '../channels/whatsapp/webhook-routes';

import { registerRateLimit } from './rate-limit';
import { registerRequestLog } from './request-log';
import { registerHealthRoutes, type HealthCheck } from './routes/health';
import type { AppInstance } from './types';

export interface ServerDependencies {
  readonly logger: Logger;
  readonly healthCheck: HealthCheck;
  /** Sin configuración de WhatsApp, el webhook no se expone. */
  readonly whatsapp?: WhatsAppWebhookOptions | undefined;
  /** Sin `WEB_CHAT_SECRET` o sin agente, el chat del sitio no se expone. */
  readonly webChat?: WebChatRouteOptions | undefined;
  /** Pedidos por minuto y por IP, en todas las rutas. */
  readonly rateLimitPerMinute?: number;
  readonly now?: () => number;
}

/** Holgado: el chat del sitio llega todo desde el servidor de apps/web. */
export const DEFAULT_RATE_LIMIT_PER_MINUTE = 600;

export function buildServer(deps: ServerDependencies): AppInstance {
  const app = Fastify({
    loggerInstance: deps.logger,
    // Nginx, en el mismo servidor, es el único proxy delante del proceso.
    trustProxy: '127.0.0.1',
    // El log de Fastify escribe la URL tal cual (con el verify token de WhatsApp): va el propio.
    disableRequestLogging: true,
  });

  registerRequestLog(app);
  registerRateLimit(app, {
    perMinute: deps.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE,
    ...(deps.now ? { now: deps.now } : {}),
  });
  registerHealthRoutes(app, deps.healthCheck, deps.now);
  if (deps.whatsapp) registerWhatsAppWebhook(app, deps.whatsapp);
  if (deps.webChat) registerWebChatRoutes(app, deps.webChat);

  return app;
}
