import 'server-only';

import type { Result } from '@norde/core/shared';
import type { Logger } from 'pino';
import { z } from 'zod';

import { clientIp, createRateLimiter } from '../../lib/request-guards';

/** Una notificación de MercadoLibre es chica: el recurso, la cuenta, el tópico y los intentos. */
const BODY_LIMIT_BYTES = 16 * 1024;

/** Los tópicos que traen contactos: `vis_leads` (todos los tipos) y `questions`. */
const LEAD_TOPICS: ReadonlySet<string> = new Set(['vis_leads', 'questions']);
/** El tópico de los cambios de un aviso (`/items/MLA…`): se concilia ese aviso. */
const ITEMS_TOPIC = 'items';
const ITEM_RESOURCE = /^\/items\/([A-Z]{3}\d{1,20})$/;

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
  resource: z.string().trim().max(200).optional(),
  user_id: NumericId,
  application_id: NumericId,
});

type Notice = Result<{ readonly portal: string | undefined }, { readonly type: string }>;

export interface MercadoLibreNotificationHandlerOptions {
  /** El ID de la app de Norde en MercadoLibre (`MERCADOLIBRE_CLIENT_ID`). */
  readonly applicationId: string;
  readonly ratePerMinute: number;
  /**
   * Pide leer los contactos de la cuenta con ese `user_id` (`NotifyAccountLeads`). Devuelve el
   * portal, o `undefined` si la cuenta no es de Norde.
   */
  readonly notify: (userId: string) => Promise<Notice>;
  /**
   * Pide conciliar el aviso `itemId` de la cuenta `userId` (`NotifyListingChanged`). Devuelve el
   * portal, o `undefined` si el aviso no es de una publicación de Norde.
   */
  readonly notifyItem: (userId: string, itemId: string) => Promise<Notice>;
  readonly logger: Logger;
  readonly now: () => number;
}

/**
 * Las notificaciones de MercadoLibre (ADR 0032 y 0035). ML no las firma: solo se acepta la de la
 * app de Norde y de una cuenta conectada, y no se usa como dato. Un contacto dispara una lectura de
 * los contactos desde la API; el cambio de un aviso (`items`), una lectura de cómo quedó ese aviso.
 * Se contesta enseguida (ML espera un 200 en 500 ms; si no, reintenta durante una hora y puede
 * desactivar los tópicos). Los demás tópicos se aceptan y se ignoran.
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

    const { topic, resource, user_id: userId, application_id: applicationId } = body.data;
    if (applicationId !== options.applicationId) {
      options.logger.warn({ ip, topic }, 'MercadoLibre notification for another application');
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    const itemId = topic === ITEMS_TOPIC ? ITEM_RESOURCE.exec(resource ?? '')?.[1] : undefined;
    if (!LEAD_TOPICS.has(topic) && itemId === undefined) {
      return Response.json({ ignored: true }, { status: 200 });
    }

    const notified =
      itemId === undefined
        ? await options.notify(userId)
        : await options.notifyItem(userId, itemId);
    if (notified.isErr()) {
      options.logger.error(
        { topic, error: notified.error.type },
        'MercadoLibre notification not processed',
      );
      return Response.json({ error: 'internal error' }, { status: 500 });
    }
    if (notified.value.portal === undefined) {
      // Un aviso que no es de Norde (todavía de Tokko) es normal: solo se loguea el de contactos.
      if (itemId === undefined) {
        options.logger.warn({ topic }, 'MercadoLibre notification for an account not connected');
      }
      return Response.json({ ignored: true }, { status: 200 });
    }
    return Response.json({ received: true }, { status: 200 });
  };
}
