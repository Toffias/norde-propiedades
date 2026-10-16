import 'server-only';

import { timingSafeEqual } from 'node:crypto';

import type { Result } from '@norde/core/shared';
import type { Logger } from 'pino';
import { z } from 'zod';

import { clientIp, createRateLimiter } from '../../lib/request-guards';

/** Un aviso de Zonaprop es chico: el ID del evento y los datos del contacto. */
const BODY_LIMIT_BYTES = 16 * 1024;

/** Los eventos que traen contactos. Los demás (estado del aviso, créditos) se ignoran por ahora. */
const LEAD_EVENTS: ReadonlySet<string> = new Set(['CONTACTO', 'CONTACTO_MENSAJE']);

/** Solo el tipo de evento: el resto no se usa, el contacto se vuelve a leer de la API. */
const CallbackBodySchema = z.object({
  tipoEvento: z.string().trim().min(1).max(60).optional(),
  eventType: z.string().trim().min(1).max(60).optional(),
});

export interface ZonapropCallbackHandlerOptions {
  /** El valor que Zonaprop manda en `header`: lo eligió Norde al activar los avisos. */
  readonly token: string;
  readonly header: string;
  readonly ratePerMinute: number;
  /** Pide leer los contactos del portal (`NotifyPortalLeads`). */
  readonly notify: () => Promise<Result<void, { readonly type: string }>>;
  readonly logger: Logger;
  readonly now: () => number;
}

/** Compara en tiempo constante: no deja adivinar el token de a un carácter. */
function sameToken(received: string | null, expected: string): boolean {
  if (received === null) return false;
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * El aviso de Zonaprop cuando llega un contacto (callbacks). Open Navent no firma el cuerpo: lo
 * autoriza con un header fijo que eligió Norde. Por eso el aviso no se usa como dato: solo dispara
 * una lectura de los contactos desde la API, y se contesta enseguida (Zonaprop espera 1,5 s y
 * reintenta ante un 4xx o 5xx).
 */
export function createZonapropCallbackHandler(
  options: ZonapropCallbackHandlerOptions,
): (request: Request) => Promise<Response> {
  const allow = createRateLimiter(options.ratePerMinute, options.now);

  return async (request) => {
    const ip = clientIp(request);
    if (!allow(ip)) return Response.json({ error: 'too many requests' }, { status: 429 });

    if (!sameToken(request.headers.get(options.header), options.token)) {
      options.logger.warn({ ip }, 'Zonaprop callback with an invalid token');
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

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
    const body = CallbackBodySchema.safeParse(payload);
    if (!body.success) return Response.json({ error: 'invalid body' }, { status: 400 });

    const event = body.data.tipoEvento ?? body.data.eventType;
    if (event !== undefined && !LEAD_EVENTS.has(event)) {
      return Response.json({ ignored: true }, { status: 200 });
    }
    const notified = await options.notify();
    if (notified.isErr()) {
      options.logger.error({ error: notified.error.type }, 'Zonaprop callback not processed');
      return Response.json({ error: 'internal error' }, { status: 500 });
    }
    return Response.json({ received: true }, { status: 200 });
  };
}
