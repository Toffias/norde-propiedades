import 'server-only';

import type {
  ReceiveInquiryError,
  ReceiveInquiryInput,
  ReceiveInquiryOutput,
} from '@norde/core/clients';
import type { Result } from '@norde/core/shared';
import type { Logger } from 'pino';
import { z } from 'zod';

import { verifySignature } from '../../lib/signature';

export const WEB_INQUIRY_SIGNATURE_HEADER = 'x-norde-signature';

/** Una consulta del formulario no pesa más que esto: el mensaje tiene un máximo de 5.000. */
const BODY_LIMIT_BYTES = 16 * 1024;
const RATE_WINDOW_MS = 60_000;

export interface WebInquiryHandlerOptions {
  /** Secreto compartido con apps/web: firma `sha256=` + HMAC del body crudo. */
  readonly secret: string;
  /** Pedidos por minuto por IP. */
  readonly ratePerMinute: number;
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
 * El IP del cliente. Nginx, en el mismo servidor, es el único proxy: agrega el IP real al final
 * de `X-Forwarded-For`, así que lo que vino antes lo pudo escribir cualquiera.
 */
function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  if (forwarded) return forwarded;
  return request.headers.get('x-real-ip') ?? 'unknown';
}

/** Ventana fija de un minuto por IP, en memoria: el panel corre en una sola instancia (ADR 0021). */
function createRateLimiter(max: number, now: () => number) {
  const windows = new Map<string, { readonly start: number; count: number }>();
  return (key: string): boolean => {
    const at = now();
    if (windows.size > 10_000) {
      for (const [ip, window] of windows) {
        if (at - window.start >= RATE_WINDOW_MS) windows.delete(ip);
      }
    }
    const current = windows.get(key);
    if (!current || at - current.start >= RATE_WINDOW_MS) {
      windows.set(key, { start: at, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= max;
  };
}

/**
 * Webhook de las consultas del formulario web. Se procesa en el momento: guardar la consulta es
 * una sola inserción y la web necesita saber si entró.
 */
export function createWebInquiryHandler(
  options: WebInquiryHandlerOptions,
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

    if (!verifySignature(raw, request.headers.get(WEB_INQUIRY_SIGNATURE_HEADER), options.secret)) {
      options.logger.warn({ ip }, 'Web inquiry webhook with invalid signature');
      return Response.json({ error: 'invalid signature' }, { status: 401 });
    }

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
