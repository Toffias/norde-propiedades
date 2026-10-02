import { z } from 'zod';

import { verifySignature } from '../../http/signature';
import type { AppInstance } from '../../http/types';

import { parseInbound, type WhatsAppInbound } from './inbound';

export const WHATSAPP_WEBHOOK_PATH = '/webhooks/whatsapp';

export interface WhatsAppWebhookOptions {
  readonly verifyToken: string;
  readonly appSecret: string;
  /** Solo se procesan mensajes dirigidos a este número (una app de Meta puede tener varios). */
  readonly phoneNumberId: string;
  /** Recibe cada mensaje válido. Tiene que volver enseguida: se procesa en segundo plano. */
  readonly onMessage: (message: WhatsAppInbound) => void;
}

const VerifyQuerySchema = z.object({
  'hub.mode': z.literal('subscribe'),
  'hub.verify_token': z.string(),
  'hub.challenge': z.string().min(1).max(200),
});

export function registerWhatsAppWebhook(app: AppInstance, options: WhatsAppWebhookOptions): void {
  void app.register((scope, _opts, done) => {
    // En este scope el body llega crudo (Buffer): la firma de Meta se calcula sobre esos bytes.
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_request, body, next) => {
        next(null, body);
      },
    );

    // Verificación inicial: Meta hace un GET con el verify token y espera el challenge.
    scope.get(WHATSAPP_WEBHOOK_PATH, async (request, reply) => {
      const query = VerifyQuerySchema.safeParse(request.query);
      if (!query.success || query.data['hub.verify_token'] !== options.verifyToken) {
        return reply.code(403).send({ error: 'invalid verify token' });
      }
      return reply.code(200).type('text/plain').send(query.data['hub.challenge']);
    });

    scope.post(WHATSAPP_WEBHOOK_PATH, async (request, reply) => {
      const raw = request.body;
      const signature = request.headers['x-hub-signature-256'];
      if (
        !Buffer.isBuffer(raw) ||
        !verifySignature(
          raw,
          typeof signature === 'string' ? signature : undefined,
          options.appSecret,
        )
      ) {
        request.log.warn({ ip: request.ip }, 'WhatsApp webhook with invalid signature');
        return reply.code(401).send({ error: 'invalid signature' });
      }

      let payload: unknown;
      try {
        payload = JSON.parse(raw.toString('utf8'));
      } catch {
        return reply.code(400).send({ error: 'invalid json' });
      }

      // Se responde 200 enseguida (si no, Meta reintenta) y se procesa en segundo plano.
      const messages = parseInbound(payload).filter(
        (m) => m.phoneNumberId === options.phoneNumberId,
      );
      for (const message of messages) options.onMessage(message);
      return reply.code(200).send({ received: messages.length });
    });

    done();
  });
}
