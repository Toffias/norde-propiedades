import 'server-only';

import type {
  ReceiveInquiryError,
  ReceiveInquiryInput,
  ReceiveInquiryOutput,
} from '@norde/core/clients';
import type { Result } from '@norde/core/shared';
import type { Logger } from 'pino';
import { z } from 'zod';

import { clientIp, createRateLimiter, createRejectionLimiter } from '../../lib/request-guards';
import { verifySignature } from '../../lib/signature';

export const WEB_INQUIRY_SIGNATURE_HEADER = 'x-norde-signature';

/** Una consulta del formulario no pesa más que esto: el mensaje tiene un máximo de 5.000. */
const BODY_LIMIT_BYTES = 16 * 1024;

export interface WebInquiryHandlerOptions {
  /** Secreto compartido con apps/web: firma `sha256=` + HMAC del body crudo. */
  readonly secret: string;
  /**
   * Pedidos rechazados (sin firma válida o demasiado grandes) por minuto por IP. Al llegar, 429
   * sin leer el body.
   */
  readonly ratePerMinute: number;
  /**
   * Consultas bien firmadas por minuto, en total. Todas llegan desde el servidor de apps/web (el
   * mismo IP), que ya limita a cada visitante: este tope solo frena un bucle o un secreto filtrado.
   */
  readonly signedRatePerMinute: number;
  /** `ReceiveInquiry` con el actor de la web. */
  readonly receive: (
    input: ReceiveInquiryInput,
  ) => Promise<Result<ReceiveInquiryOutput, ReceiveInquiryError>>;
  readonly logger: Logger;
  /** Milisegundos de ahora, para la ventana del rate limit. */
  readonly now: () => number;
}

/**
 * Lo que manda apps/web por cada envío del formulario de contacto. `externalId` lo genera la web
 * por envío: un reintento con el mismo ID no crea otra consulta.
 */
const WebInquiryBodySchema = z.object({
  externalId: z.uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().min(1).max(254).optional(),
  phone: z.string().trim().min(1).max(40).optional(),
  message: z.string().trim().min(1).max(5000).optional(),
  propertyId: z.uuid().optional(),
});

/** Los errores esperados de `ReceiveInquiry` que dependen de lo que mandó la web. */
const REJECTED: ReadonlySet<ReceiveInquiryError['type']> = new Set([
  'InvalidInput',
  'InvalidPhone',
  'InvalidEmail',
  'MissingContactInfo',
]);

/**
 * Webhook de las consultas del formulario web. Se procesa en el momento: guardar la consulta es
 * una sola inserción y la web necesita saber si entró.
 */
export function createWebInquiryHandler(
  options: WebInquiryHandlerOptions,
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

    if (!verifySignature(raw, request.headers.get(WEB_INQUIRY_SIGNATURE_HEADER), options.secret)) {
      rejections.record(ip);
      options.logger.warn({ ip }, 'Web inquiry webhook with invalid signature');
      return Response.json({ error: 'invalid signature' }, { status: 401 });
    }
    // Firmada: viene del servidor de apps/web, que ya limitó al visitante. No gasta el cupo del IP.
    if (!allowSigned('apps/web')) return tooMany();

    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      return Response.json({ error: 'invalid json' }, { status: 400 });
    }
    const body = WebInquiryBodySchema.safeParse(payload);
    if (!body.success) {
      return Response.json(
        {
          error: 'invalid body',
          fields: [...new Set(body.error.issues.map((issue) => issue.path.join('.')))],
        },
        { status: 400 },
      );
    }

    const result = await options.receive({ channel: 'web_form', ...body.data });
    if (result.isErr()) {
      if (REJECTED.has(result.error.type)) {
        return Response.json({ error: result.error.type }, { status: 422 });
      }
      // `Forbidden`: el actor de la web está mal configurado.
      options.logger.error({ error: result.error.type }, 'Web inquiry rejected by the use case');
      return Response.json({ error: 'internal error' }, { status: 500 });
    }
    const { inquiryId, duplicate } = result.value;
    return Response.json({ inquiryId, duplicate }, { status: duplicate ? 200 : 201 });
  };
}
