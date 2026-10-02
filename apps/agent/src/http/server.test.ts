import { pino } from 'pino';
import { afterAll, describe, expect, it } from 'vitest';

import type { WhatsAppInbound } from '../channels/whatsapp/inbound';
import { signBody } from './signature';
import { WHATSAPP_WEBHOOK_PATH } from '../channels/whatsapp/webhook-routes';

import type { HealthStatus } from './routes/health';
import { buildServer } from './server';

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
