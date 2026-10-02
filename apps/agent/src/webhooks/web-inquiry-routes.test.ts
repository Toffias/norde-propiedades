import type { ReceiveInquiryError, ReceiveInquiryInput } from '@norde/core/clients';
import { err, ok } from '@norde/core/shared';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { buildServer } from '../http/server';
import { signBody } from '../http/signature';

import { WEB_INQUIRY_SIGNATURE_HEADER, WEB_INQUIRY_WEBHOOK_PATH } from './web-inquiry-routes';

const SECRET = 'a-shared-secret-of-at-least-32-chars!';
const EXTERNAL_ID = '0199c3a0-0000-7000-8000-000000000001';
const INQUIRY_ID = '0199c3a0-0000-7000-8000-0000000000f1';

function setup(options: { ratePerMinute?: number; error?: ReceiveInquiryError } = {}) {
  const received: ReceiveInquiryInput[] = [];
  const seen = new Set<string>();
  const app = buildServer({
    logger: pino({ level: 'silent' }),
    healthCheck: () => Promise.resolve({ database: 'up' }),
    webInquiries: {
      secret: SECRET,
      ratePerMinute: options.ratePerMinute ?? 60,
      receive: (input) => {
        received.push(input);
        if (options.error) return Promise.resolve(err(options.error));
        const duplicate = seen.has(input.externalId);
        seen.add(input.externalId);
        return Promise.resolve(ok({ inquiryId: INQUIRY_ID, duplicate }));
      },
    },
  });
  /** `null`: sin header de firma. */
  const post = (body: string, signature: string | null = signBody(body, SECRET)) =>
    app.inject({
      method: 'POST',
      url: WEB_INQUIRY_WEBHOOK_PATH,
      headers: {
        'content-type': 'application/json',
        ...(signature === null ? {} : { [WEB_INQUIRY_SIGNATURE_HEADER]: signature }),
      },
      payload: body,
    });
  return { app, received, post };
}

const BODY = JSON.stringify({
  externalId: EXTERNAL_ID,
  name: 'Ana Pérez',
  email: 'ana@example.com',
  message: 'Hola, ¿sigue disponible?',
  propertyId: '00000000-0000-7000-8000-0000000000e1',
});

describe('Web inquiry webhook', () => {
  it('registers a signed inquiry from the web form', async () => {
    const { received, post } = setup();

    const response = await post(BODY);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ inquiryId: INQUIRY_ID, duplicate: false });
    expect(received).toEqual([
      {
        channel: 'web_form',
        externalId: EXTERNAL_ID,
        name: 'Ana Pérez',
        email: 'ana@example.com',
        message: 'Hola, ¿sigue disponible?',
        propertyId: '00000000-0000-7000-8000-0000000000e1',
      },
    ]);
  });

  it('answers 200 to a retry of the same submission', async () => {
    const { post } = setup();

    await post(BODY);
    const again = await post(BODY);

    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ inquiryId: INQUIRY_ID, duplicate: true });
  });

  it('rejects a missing, malformed or wrong signature without calling the use case', async () => {
    const { received, post } = setup();

    expect((await post(BODY, null)).statusCode).toBe(401);
    expect((await post(BODY, 'sha256=zz')).statusCode).toBe(401);
    expect((await post(BODY, signBody(BODY, 'another-secret'))).statusCode).toBe(401);
    // La firma es del body crudo: el mismo JSON re-serializado distinto no vale.
    expect((await post(`${BODY} `, signBody(BODY, SECRET))).statusCode).toBe(401);
    expect(received).toEqual([]);
  });

  it('validates the body at the edge', async () => {
    const { received, post } = setup();

    const invalid = await post(JSON.stringify({ externalId: 'not-a-uuid', name: '' }));
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: 'invalid body', fields: ['externalId', 'name'] });
    expect((await post('{not json')).statusCode).toBe(400);
    expect(received).toEqual([]);
  });

  it('answers 422 to what the use case rejects and 500 to a misconfiguration', async () => {
    expect((await setup({ error: { type: 'MissingContactInfo' } }).post(BODY)).json()).toEqual({
      error: 'MissingContactInfo',
    });
    expect((await setup({ error: { type: 'InvalidPhone' } }).post(BODY)).statusCode).toBe(422);
    expect((await setup({ error: { type: 'Forbidden' } }).post(BODY)).statusCode).toBe(500);
  });

  it('rejects bodies over the size limit', async () => {
    const { post } = setup();

    const response = await post(
      JSON.stringify({ externalId: EXTERNAL_ID, message: 'x'.repeat(20_000) }),
    );

    expect(response.statusCode).toBe(413);
  });

  it('limits the requests per IP', async () => {
    const { post } = setup({ ratePerMinute: 2 });

    expect((await post(BODY)).statusCode).toBe(201);
    expect((await post(BODY)).statusCode).toBe(200);
    expect((await post(BODY)).statusCode).toBe(429);
  });

  it('is not exposed without a secret', async () => {
    const app = buildServer({
      logger: pino({ level: 'silent' }),
      healthCheck: () => Promise.resolve({ database: 'up' }),
    });

    const response = await app.inject({ method: 'POST', url: WEB_INQUIRY_WEBHOOK_PATH });

    expect(response.statusCode).toBe(404);
  });
});
