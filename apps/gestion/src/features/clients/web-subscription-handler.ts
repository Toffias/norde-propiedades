import 'server-only';

import type {
  RequestSearchSubscriptionError,
  RequestSearchSubscriptionInput,
} from '@norde/core/clients';
import {
  RequestSearchSubscriptionInputSchema,
  type RequestSearchSubscriptionOutput,
} from '@norde/core/clients/contracts';
import type { Result } from '@norde/core/shared';
import type { Logger } from 'pino';

import { clientIp, createRateLimiter, createRejectionLimiter } from '../../lib/request-guards';
import { verifySignature } from '../../lib/signature';

export const WEB_SUBSCRIPTION_SIGNATURE_HEADER = 'x-norde-signature';

/** Un pedido de suscripción no pesa más que esto: nombre, email, resumen y unos filtros. */
const BODY_LIMIT_BYTES = 8 * 1024;

export interface WebSubscriptionHandlerOptions {
  /** Secreto compartido con apps/web (el de las consultas): firma `sha256=` + HMAC del body. */
  readonly secret: string;
  /** Pedidos rechazados (sin firma válida o demasiado grandes) por minuto por IP. */
  readonly ratePerMinute: number;
  /** Pedidos bien firmados por minuto, en total: solo frena un bucle o un secreto filtrado. */
  readonly signedRatePerMinute: number;
  /** `RequestSearchSubscription` con el actor de la web. */
  readonly request: (
    input: RequestSearchSubscriptionInput,
  ) => Promise<Result<RequestSearchSubscriptionOutput, RequestSearchSubscriptionError>>;
  readonly logger: Logger;
  /** Milisegundos de ahora, para la ventana del rate limit. */
  readonly now: () => number;
}

/** Los errores esperados que dependen de lo que mandó la web. */
const REJECTED: ReadonlySet<RequestSearchSubscriptionError['type']> = new Set([
  'InvalidInput',
  'InvalidEmail',
  'InvalidSavedSearch',
]);

/**
 * Webhook de las suscripciones a búsquedas del sitio (#208). Valida con el contract del caso de
 * uso, guarda el pedido y manda el email de confirmación en el momento: la web le dice a la
 * persona que revise su casilla.
 */
export function createWebSubscriptionHandler(
  options: WebSubscriptionHandlerOptions,
): (request: Request) => Promise<Response> {
  const rejections = createRejectionLimiter(options.ratePerMinute, options.now);
  const allowSigned = createRateLimiter(options.signedRatePerMinute, options.now);
  const tooMany = () => Response.json({ error: 'too many requests' }, { status: 429 });

  return async (request) => {
    const ip = clientIp(request);
    if (rejections.blocked(ip)) return tooMany();
    const tooLarge = () => {
      rejections.record(ip);
      return Response.json({ error: 'body too large' }, { status: 413 });
    };

    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (declaredLength > BODY_LIMIT_BYTES) return tooLarge();
    const raw = Buffer.from(await request.arrayBuffer());
    if (raw.byteLength > BODY_LIMIT_BYTES) return tooLarge();

    if (
      !verifySignature(raw, request.headers.get(WEB_SUBSCRIPTION_SIGNATURE_HEADER), options.secret)
    ) {
      rejections.record(ip);
      options.logger.warn({ ip }, 'Web subscription webhook with invalid signature');
      return Response.json({ error: 'invalid signature' }, { status: 401 });
    }
    if (!allowSigned('apps/web')) return tooMany();

    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      return Response.json({ error: 'invalid json' }, { status: 400 });
    }
    const body = RequestSearchSubscriptionInputSchema.safeParse(payload);
    if (!body.success) {
      return Response.json(
        {
          error: 'invalid body',
          fields: [...new Set(body.error.issues.map((issue) => issue.path.join('.')))],
        },
        { status: 400 },
      );
    }

    const result = await options.request(body.data);
    if (result.isErr()) {
      if (REJECTED.has(result.error.type)) {
        return Response.json({ error: result.error.type }, { status: 422 });
      }
      // `Forbidden`, `SendingNotConfigured` o el proveedor de email: lo resuelve el equipo.
      options.logger.error({ error: result.error }, 'Web subscription rejected by the use case');
      return Response.json({ error: 'internal error' }, { status: 500 });
    }
    return Response.json(result.value, { status: 202 });
  };
}
