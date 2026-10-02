import rateLimit from '@fastify/rate-limit';
import type {
  ReceiveInquiryError,
  ReceiveInquiryInput,
  ReceiveInquiryOutput,
} from '@norde/core/clients';
import type { Result } from '@norde/core/shared';
import { z } from 'zod';

import { verifySignature } from '../http/signature';
import type { AppInstance } from '../http/types';

export const WEB_INQUIRY_WEBHOOK_PATH = '/webhooks/inquiries/web';
export const WEB_INQUIRY_SIGNATURE_HEADER = 'x-norde-signature';

/** Una consulta del formulario no pesa más que esto: el mensaje tiene un máximo de 5.000. */
const BODY_LIMIT_BYTES = 16 * 1024;

export interface WebInquiryWebhookOptions {
  /** Secreto compartido con apps/web: firma `sha256=` + HMAC del body crudo. */
  readonly secret: string;
  /** Pedidos por minuto por IP. */
  readonly ratePerMinute: number;
  /** `ReceiveInquiry` con el actor de la web. */
  readonly receive: (
    input: ReceiveInquiryInput,
  ) => Promise<Result<ReceiveInquiryOutput, ReceiveInquiryError>>;
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
 * Webhook de las consultas del formulario web. A diferencia de los de Meta, se procesa en el
 * momento: guardar la consulta es una sola inserción y la web necesita saber si entró.
 */
export function registerWebInquiryWebhook(
  app: AppInstance,
  options: WebInquiryWebhookOptions,
): void {
  void app.register(async (scope) => {
    await scope.register(rateLimit, {
      max: options.ratePerMinute,
      timeWindow: '1 minute',
    });

    // En este scope el body llega crudo (Buffer): la firma se calcula sobre esos bytes.
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer', bodyLimit: BODY_LIMIT_BYTES },
      (_request, body, next) => {
        next(null, body);
      },
    );

    scope.post(WEB_INQUIRY_WEBHOOK_PATH, async (request, reply) => {
      const raw = request.body;
      const signature = request.headers[WEB_INQUIRY_SIGNATURE_HEADER];
      if (
        !Buffer.isBuffer(raw) ||
        !verifySignature(raw, typeof signature === 'string' ? signature : undefined, options.secret)
      ) {
        request.log.warn({ ip: request.ip }, 'Web inquiry webhook with invalid signature');
        return reply.code(401).send({ error: 'invalid signature' });
      }

      let payload: unknown;
      try {
        payload = JSON.parse(raw.toString('utf8'));
      } catch {
        return reply.code(400).send({ error: 'invalid json' });
      }
      const body = WebInquiryBodySchema.safeParse(payload);
      if (!body.success) {
        return reply.code(400).send({
          error: 'invalid body',
          fields: [...new Set(body.error.issues.map((issue) => issue.path.join('.')))],
        });
      }

      const result = await options.receive({ channel: 'web_form', ...body.data });
      if (result.isErr()) {
        if (REJECTED.has(result.error.type)) {
          return reply.code(422).send({ error: result.error.type });
        }
        // `Forbidden`: el actor de la web está mal configurado.
        request.log.error({ error: result.error.type }, 'Web inquiry rejected by the use case');
        return reply.code(500).send({ error: 'internal error' });
      }
      const { inquiryId, duplicate } = result.value;
      return reply.code(duplicate ? 200 : 201).send({ inquiryId, duplicate });
    });
  });
}
