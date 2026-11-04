import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { WebSearchSubscriptionClient } from './web-search-subscription-client';

// Valor de prueba, no un secreto: el HMAC solo pide que coincida de los dos lados.
const SECRET = 'test-'.repeat(8);
const URL = 'https://gestion.example/api/webhooks/subscriptions/web';
const subscription = {
  name: 'Ana',
  email: 'ana@example.com',
  frequency: 'weekly' as const,
  summary: 'Departamentos en venta',
  operation: 'sale',
  propertyTypes: ['apartment'],
  locationIds: [],
};

function clientAnswering(status: number, body: unknown = {}) {
  const requests: { body: string; signature: string | null }[] = [];
  const client = new WebSearchSubscriptionClient({
    url: URL,
    secret: SECRET,
    fetch: (_url, init) => {
      requests.push({
        body: typeof init?.body === 'string' ? init.body : '',
        signature: new Headers(init?.headers).get('x-norde-signature'),
      });
      return Promise.resolve(Response.json(body, { status }));
    },
  });
  return { client, requests };
}

describe('WebSearchSubscriptionClient', () => {
  it('posts the request signed with the shared secret', async () => {
    const { client, requests } = clientAnswering(202, { requested: true });
    expect(await client.send(subscription)).toEqual({ kind: 'requested' });
    const body = JSON.stringify(subscription);
    expect(requests).toEqual([
      { body, signature: `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}` },
    ]);
  });

  it('reports the data gestion rejected and when it is busy', async () => {
    expect(await clientAnswering(422, { error: 'InvalidEmail' }).client.send(subscription)).toEqual(
      { kind: 'rejected', reason: 'InvalidEmail' },
    );
    expect(await clientAnswering(429).client.send(subscription)).toEqual({ kind: 'busy' });
  });

  it('throws on any other error', async () => {
    await expect(clientAnswering(500).client.send(subscription)).rejects.toThrow('500');
  });
});
