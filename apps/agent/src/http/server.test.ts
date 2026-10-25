import { pino } from 'pino';
import { afterAll, describe, expect, it } from 'vitest';

import { WEB_CHAT_PATH } from '../channels/web-chat/web-chat-routes';
import type { WebChatInbound, WebChatTurnResult } from '../channels/web-chat/web-chat-turn-handler';
import type { WhatsAppInbound } from '../channels/whatsapp/inbound';
import { WHATSAPP_WEBHOOK_PATH } from '../channels/whatsapp/webhook-routes';

import type { HealthStatus } from './routes/health';
import { buildServer } from './server';
import { signBody, signTimestamped } from './signature';

const silent = pino({ level: 'silent' });

function serverWith(status: HealthStatus) {
  return buildServer({ logger: silent, healthCheck: () => Promise.resolve(status) });
}

describe('GET /health', () => {
  it('returns 200 when the database is up', async () => {
    const response = await serverWith({ database: 'up' }).inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', database: 'up' });
  });

  it('returns 503 when the database is down', async () => {
    const response = await serverWith({ database: 'down' }).inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'degraded', database: 'down' });
  });
});

describe('WhatsApp webhook', () => {
  const received: WhatsAppInbound[] = [];
  const app = buildServer({
    logger: silent,
    healthCheck: () => Promise.resolve({ database: 'up' }),
    whatsapp: {
      verifyToken: 'verify-me',
      appSecret: 'secret',
      phoneNumberId: 'PNID',
      onMessage: (message) => received.push(message),
    },
  });
  afterAll(() => app.close());

  const body = (phoneNumberId: string) =>
    JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '1', phone_number_id: phoneNumberId },
                messages: [
                  {
                    from: '5491166899124',
                    id: `wamid.${phoneNumberId}`,
                    timestamp: '1767225600',
                    type: 'text',
                    text: { body: 'hola' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

  const post = (payload: string, signature: string) =>
    app.inject({
      method: 'POST',
      url: WHATSAPP_WEBHOOK_PATH,
      payload,
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    });

  it('answers the verification challenge only with the right token', async () => {
    const ok = await app.inject({
      method: 'GET',
      url: `${WHATSAPP_WEBHOOK_PATH}?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345`,
    });
    const wrong = await app.inject({
      method: 'GET',
      url: `${WHATSAPP_WEBHOOK_PATH}?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1`,
    });

    expect(ok.statusCode).toBe(200);
    expect(ok.body).toBe('12345');
    expect(wrong.statusCode).toBe(403);
  });

  it('rejects an invalid signature without processing', async () => {
    const response = await post(body('PNID'), 'sha256=00');

    expect(response.statusCode).toBe(401);
    expect(received).toEqual([]);
  });

  it('accepts a signed payload, answers 200 and hands over the message', async () => {
    const payload = body('PNID');

    const response = await post(payload, signBody(payload, 'secret'));

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: 1 });
    expect(received.map((m) => m.message.text)).toEqual(['hola']);
  });

  it('ignores messages addressed to other numbers of the same Meta app', async () => {
    received.length = 0;
    const payload = body('OTHER');

    const response = await post(payload, signBody(payload, 'secret'));

    expect(response.json()).toEqual({ received: 0 });
    expect(received).toEqual([]);
  });

  it('rejects signed bodies that are not JSON', async () => {
    const response = await post('{no', signBody('{no', 'secret'));

    expect(response.statusCode).toBe(400);
  });

  it('is not exposed when WhatsApp is not configured', async () => {
    const response = await serverWith({ database: 'up' }).inject({
      method: 'GET',
      url: `${WHATSAPP_WEBHOOK_PATH}?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1`,
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('Web chat endpoint', () => {
  // Valor de prueba, no un secreto: el HMAC solo pide que coincida de los dos lados.
  const secret = 'test-'.repeat(8);
  const handled: WebChatInbound[] = [];
  let result: WebChatTurnResult = { kind: 'reply', reply: null };
  const app = buildServer({
    logger: silent,
    healthCheck: () => Promise.resolve({ database: 'up' }),
    webChat: {
      secret,
      handle: (message) => {
        handled.push(message);
        return Promise.resolve(result);
      },
    },
  });
  afterAll(() => app.close());

  const message = {
    sessionId: '00000000-0000-4000-8000-0000000000a1',
    messageId: '00000000-0000-4000-8000-0000000000b1',
    text: '  busco depto  ',
  };
  const post = (
    payload: string,
    timestamp = String(Date.now()),
    signature = signTimestamped(payload, timestamp, secret),
  ) =>
    app.inject({
      method: 'POST',
      url: WEB_CHAT_PATH,
      headers: {
        'content-type': 'application/json',
        'x-norde-signature': signature,
        'x-norde-timestamp': timestamp,
      },
      payload,
    });

  it('rejects a message without a valid signature', async () => {
    const payload = JSON.stringify(message);
    const now = String(Date.now());
    const response = await post(payload, now, signTimestamped(payload, now, 'other-'.repeat(8)));

    expect(response.statusCode).toBe(401);
    expect(handled).toEqual([]);
  });

  it('rejects a replayed message: old date, or a date that is not the signed one', async () => {
    const payload = JSON.stringify(message);
    const old = String(Date.now() - 10 * 60_000);
    const now = String(Date.now());

    expect((await post(payload, old)).statusCode).toBe(401);
    expect((await post(payload, now, signTimestamped(payload, old, secret))).statusCode).toBe(401);
    expect((await post(payload, now, signBody(payload, secret))).statusCode).toBe(401);
    expect(handled).toEqual([]);
  });

  it('rejects an invalid body', async () => {
    expect((await post('{nope')).statusCode).toBe(400);
    expect((await post(JSON.stringify({ ...message, sessionId: 'abc' }))).statusCode).toBe(400);
    expect((await post(JSON.stringify({ ...message, text: '   ' }))).statusCode).toBe(400);
    expect(handled).toEqual([]);
  });

  it('answers with the reply of the turn', async () => {
    const reply = { text: '¡Hola!', photoUrl: null, cards: [], listing: null, buttons: [] };
    result = { kind: 'reply', reply };

    const response = await post(JSON.stringify(message));

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ reply });
    expect(handled.at(-1)).toEqual({ ...message, text: 'busco depto' });
  });

  it('maps busy to 429 and unavailable to 503', async () => {
    result = { kind: 'busy' };
    expect((await post(JSON.stringify(message))).statusCode).toBe(429);
    result = { kind: 'unavailable' };
    expect((await post(JSON.stringify(message))).statusCode).toBe(503);
  });
});

describe('without web chat configuration', () => {
  it('does not expose the endpoint', async () => {
    const response = await serverWith({ database: 'up' }).inject({
      method: 'POST',
      url: WEB_CHAT_PATH,
      payload: {},
    });

    expect(response.statusCode).toBe(404);
  });
});
