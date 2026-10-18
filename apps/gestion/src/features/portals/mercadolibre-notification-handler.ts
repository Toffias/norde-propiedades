import 'server-only';

import type { Result } from '@norde/core/shared';
import type { Logger } from 'pino';
import { z } from 'zod';

import { clientIp, createRateLimiter } from '../../lib/request-guards';

/** Una notificación de MercadoLibre es chica: el recurso, la cuenta, el tópico y los intentos. */
const BODY_LIMIT_BYTES = 16 * 1024;

/** Los tópicos que traen contactos: `vis_leads` (todos los tipos) y `questions`. */
const LEAD_TOPICS: ReadonlySet<string> = new Set(['vis_leads', 'questions']);

const NumericId = z
  .union([
    z
      .string()
      .trim()
      .regex(/^\d{1,20}$/),
    z.number().int().nonnegative(),
  ])
  .transform(String);

/** Solo lo que dice a quién avisa y de qué: el contacto se vuelve a leer de la API. */
const NotificationSchema = z.object({
  topic: z.string().trim().min(1).max(60),
  user_id: NumericId,
  application_id: NumericId,
});

export interface MercadoLibreNotificationHandlerOptions {
  /** El ID de la app de Norde en MercadoLibre (`MERCADOLIBRE_CLIENT_ID`). */
  readonly applicationId: string;
  readonly ratePerMinute: number;
  /**
   * Pide leer los contactos de la cuenta con ese `user_id` (`NotifyAccountLeads`). Devuelve el
   * portal, o `undefined` si la cuenta no es de Norde.
   */
  readonly notify: (
    userId: string,
  ) => Promise<Result<{ readonly portal: string | undefined }, { readonly type: string }>>;
  readonly logger: Logger;
  readonly now: () => number;
}

/**
 * Las notificaciones de MercadoLibre (ADR 0032). ML no las firma: solo se acepta la de la app de
 * Norde y de una cuenta conectada, y no se usa como dato. Dispara una lectura de los contactos
 * desde la API, y se contesta enseguida (ML espera un 200 en 500 ms; si no, reintenta durante una
 * hora y puede desactivar los tópicos). Los tópicos que no traen contactos se aceptan y se ignoran.
 */
export function createMercadoLibreNotificationHandler(
  options: MercadoLibreNotificationHandlerOptions,
): (request: Request) => Promise<Response> {
  const allow = createRateLimiter(options.ratePerMinute, options.now);

  return async (request) => {
    const ip = clientIp(request);
    if (!allow(ip)) return Response.json({ error: 'too many requests' }, { status: 429 });

    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (declaredLength > BODY_LIMIT_BYTES) {
      return Response.json({ error: 'body too large' }, { status: 413 });
    }
    const raw = Buffer.from(await request.arrayBuffer());
    if (raw.byteLength > BODY_LIMIT_BYTES) {
      return Response.json({ error: 'body too large' }, { status: 413 });
    }
    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      return Response.json({ error: 'invalid json' }, { status: 400 });
    }
    const body = NotificationSchema.safeParse(payload);
    if (!body.success) return Response.json({ error: 'invalid body' }, { status: 400 });

    const { topic, user_id: userId, application_id: applicationId } = body.data;
    if (applicationId !== options.applicationId) {
      options.logger.warn({ ip, topic }, 'MercadoLibre notification for another application');
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    if (!LEAD_TOPICS.has(topic)) return Response.json({ ignored: true }, { status: 200 });

    const notified = await options.notify(userId);
    if (notified.isErr()) {
      options.logger.error(
        { topic, error: notified.error.type },
        'MercadoLibre notification not processed',
      );
      return Response.json({ error: 'internal error' }, { status: 500 });
    }
    if (notified.value.portal === undefined) {
      options.logger.warn({ topic }, 'MercadoLibre notification for an account not connected');
      return Response.json({ ignored: true }, { status: 200 });
    }
    return Response.json({ received: true }, { status: 200 });
  };
}
