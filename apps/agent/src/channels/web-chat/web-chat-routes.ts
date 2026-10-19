import { z } from 'zod';

import { verifySignature } from '../../http/signature';
import type { AppInstance } from '../../http/types';

import type { WebChatInbound, WebChatTurnResult } from './web-chat-turn-handler';

export const WEB_CHAT_PATH = '/chat/messages';

/** Más largo que el recorte del core (`MAX_INBOUND_TEXT_CHARS`): acá solo se frena el abuso. */
const MAX_TEXT_CHARS = 4000;

export interface WebChatRouteOptions {
  /** Secreto compartido con apps/web (`AGENT_CHAT_SECRET`). */
  readonly secret: string;
  /** Atiende el mensaje en la cola de su sesión y devuelve la respuesta. */
  readonly handle: (message: WebChatInbound) => Promise<WebChatTurnResult>;
}

const BodySchema = z.object({
  sessionId: z.uuid(),
  messageId: z.uuid(),
  text: z.string().trim().min(1).max(MAX_TEXT_CHARS),
});

/**
 * `POST /chat/messages`: un mensaje del chat del sitio (ADR 0037). Solo lo llama el servidor de
 * apps/web, con el body firmado: el navegador nunca habla directo con el agente.
 */
export function registerWebChatRoutes(app: AppInstance, options: WebChatRouteOptions): void {
  void app.register((scope, _opts, done) => {
    // En este scope el body llega crudo (Buffer): la firma se calcula sobre esos bytes.
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_request, body, next) => {
        next(null, body);
      },
    );

    scope.post(WEB_CHAT_PATH, async (request, reply) => {
      const raw = request.body;
      const signature = request.headers['x-norde-signature'];
      if (
        !Buffer.isBuffer(raw) ||
        !verifySignature(raw, typeof signature === 'string' ? signature : undefined, options.secret)
      ) {
        request.log.warn({ ip: request.ip }, 'Web chat message with invalid signature');
        return reply.code(401).send({ error: 'invalid signature' });
      }

      let payload: unknown;
      try {
        payload = JSON.parse(raw.toString('utf8'));
      } catch {
        return reply.code(400).send({ error: 'invalid json' });
      }
      const body = BodySchema.safeParse(payload);
      if (!body.success) return reply.code(400).send({ error: 'invalid message' });

      const result = await options.handle(body.data);
      switch (result.kind) {
        case 'reply':
          return reply.code(200).send({ reply: result.reply });
        case 'busy':
          return reply.code(429).send({ error: 'too many messages' });
        case 'unavailable':
          return reply.code(503).send({ error: 'agent unavailable' });
      }
    });

    done();
  });
}
