import type { ReceiveInquiryError, ReceiveInquiryInput } from '@norde/core/clients';
import { err, ok } from '@norde/core/shared';
import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import { signBody } from '../../lib/signature';

import { createWebInquiryHandler, WEB_INQUIRY_SIGNATURE_HEADER } from './web-inquiry-handler';

vi.mock('server-only', () => ({}));

const SECRET = 'a-shared-secret-of-at-least-32-chars!';
const EXTERNAL_ID = '0199c3a0-0000-7000-8000-000000000001';
const INQUIRY_ID = '0199c3a0-0000-7000-8000-0000000000f1';
const URL = 'http://localhost:3001/api/webhooks/inquiries/web';

function setup(options: { ratePerMinute?: number; error?: ReceiveInquiryError } = {}) {
  const received: ReceiveInquiryInput[] = [];
  const seen = new Set<string>();
  const clock = { now: 0 };
  const handle = createWebInquiryHandler({
    secret: SECRET,
    ratePerMinute: options.ratePerMinute ?? 60,
    logger: pino({ level: 'silent' }),
    now: () => clock.now,
    receive: (input) => {
      received.push(input);
      if (options.error) return Promise.resolve(err(options.error));
      const duplicate = seen.has(input.externalId);
      seen.add(input.externalId);
      return Promise.resolve(ok({ inquiryId: INQUIRY_ID, duplicate }));
    },
  });
  /** `null`: sin header de firma. */
  const post = (
    body: string,
    signature: string | null = signBody(body, SECRET),
    ip = '203.0.113.7',
  ) =>
    handle(
      new Request(URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': ip,
          ...(signature === null ? {} : { [WEB_INQUIRY_SIGNATURE_HEADER]: signature }),
        },
        body,
      }),
    );
  return { received, post, clock };
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

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ inquiryId: INQUIRY_ID, duplicate: false });
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

    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ inquiryId: INQUIRY_ID, duplicate: true });
  });

  it('rejects a missing, malformed or wrong signature without calling the use case', async () => {
    const { received, post } = setup();

    expect((await post(BODY, null)).status).toBe(401);
    expect((await post(BODY, 'sha256=zz')).status).toBe(401);
    expect((await post(BODY, signBody(BODY, 'another-secret'))).status).toBe(401);
    // La firma es del body crudo: el mismo JSON re-serializado distinto no vale.
    expect((await post(`${BODY} `, signBody(BODY, SECRET))).status).toBe(401);
    expect(received).toEqual([]);
  });

  it('validates the body at the edge', async () => {
    const { received, post } = setup();

    const invalid = await post(JSON.stringify({ externalId: 'not-a-uuid', name: '' }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'invalid body', fields: ['externalId', 'name'] });
    expect((await post('{not json')).status).toBe(400);
    expect(received).toEqual([]);
  });

  it('answers 422 to what the use case rejects and 500 to a misconfiguration', async () => {
    const missing = await setup({ error: { type: 'MissingContactInfo' } }).post(BODY);
    expect(missing.status).toBe(422);
    expect(await missing.json()).toEqual({ error: 'MissingContactInfo' });
    expect((await setup({ error: { type: 'InvalidPhone' } }).post(BODY)).status).toBe(422);
    expect((await setup({ error: { type: 'Forbidden' } }).post(BODY)).status).toBe(500);
  });

  it('rejects bodies over the size limit', async () => {
    const { received, post } = setup();

    const response = await post(
      JSON.stringify({ externalId: EXTERNAL_ID, message: 'x'.repeat(20_000) }),
    );

    expect(response.status).toBe(413);
    expect(received).toEqual([]);
  });

  it('limits the requests per IP, by the address the proxy appended', async () => {
    const { post, clock } = setup({ ratePerMinute: 2 });

    expect((await post(BODY)).status).toBe(201);
    expect((await post(BODY)).status).toBe(200);
    expect((await post(BODY)).status).toBe(429);
    // Un IP falso antes del que agregó Nginx no saltea el límite.
    expect((await post(BODY, undefined, '198.51.100.1, 203.0.113.7')).status).toBe(429);
    expect((await post(BODY, undefined, '198.51.100.1')).status).toBe(200);

    clock.now = 60_000;
    expect((await post(BODY)).status).toBe(200);
  });
});
