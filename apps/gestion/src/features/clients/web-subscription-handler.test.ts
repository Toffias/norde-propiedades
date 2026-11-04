import type {
  RequestSearchSubscriptionError,
  RequestSearchSubscriptionInput,
} from '@norde/core/clients';
import { err, ok } from '@norde/core/shared';
import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import { signBody } from '../../lib/signature';

import {
  createWebSubscriptionHandler,
  WEB_SUBSCRIPTION_SIGNATURE_HEADER,
} from './web-subscription-handler';

vi.mock('server-only', () => ({}));

const SECRET = 'a-shared-secret-of-at-least-32-chars!';
const URL = 'http://localhost:3001/api/webhooks/subscriptions/web';
const BODY = JSON.stringify({
  name: 'Ana',
  email: 'ana@example.com',
  frequency: 'weekly',
  summary: 'Departamentos en venta',
  operation: 'sale',
  propertyTypes: ['apartment'],
  currency: 'USD',
  maxPrice: '150000',
  locationIds: [],
});

function setup(options: { ratePerMinute?: number; error?: RequestSearchSubscriptionError } = {}) {
  const requested: RequestSearchSubscriptionInput[] = [];
  const handle = createWebSubscriptionHandler({
    secret: SECRET,
    ratePerMinute: options.ratePerMinute ?? 60,
    signedRatePerMinute: 600,
    logger: pino({ level: 'silent' }),
    now: () => 0,
    request: (input) => {
      requested.push(input);
      if (options.error) return Promise.resolve(err(options.error));
      return Promise.resolve(ok({ requested: true }));
    },
  });
  const post = (body: string, signature: string | null = signBody(body, SECRET)) =>
    handle(
      new Request(URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.7',
          ...(signature === null ? {} : { [WEB_SUBSCRIPTION_SIGNATURE_HEADER]: signature }),
        },
        body,
      }),
    );
  return { requested, post };
}

describe('createWebSubscriptionHandler', () => {
  it('passes a signed request to the use case with the prices in cents', async () => {
    const { requested, post } = setup();

    const response = await post(BODY);

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ requested: true });
    expect(requested).toMatchObject([
      { email: 'ana@example.com', frequency: 'weekly', maxPrice: 15_000_000n },
    ]);
  });

  it('rejects a bad or missing signature without calling the use case', async () => {
    const { requested, post } = setup();

    expect((await post(BODY, 'sha256=nope')).status).toBe(401);
    expect((await post(BODY, null)).status).toBe(401);
    expect(requested).toEqual([]);
  });

  it('blocks an IP after too many rejected requests', async () => {
    const { post } = setup({ ratePerMinute: 1 });

    await post(BODY, 'sha256=nope');

    expect((await post(BODY)).status).toBe(429);
  });

  it('rejects an invalid body naming the fields', async () => {
    const { requested, post } = setup();
    const body = JSON.stringify({ ...JSON.parse(BODY), frequency: 'daily' });

    const response = await post(body);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid body', fields: ['frequency'] });
    expect(requested).toEqual([]);
  });

  it('answers 422 to the errors of the data and 500 to the rest', async () => {
    expect((await setup({ error: { type: 'InvalidEmail' } }).post(BODY)).status).toBe(422);
    expect((await setup({ error: { type: 'MailUnavailable' } }).post(BODY)).status).toBe(500);
  });
});
