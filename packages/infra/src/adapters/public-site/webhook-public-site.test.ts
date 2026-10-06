import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { LogPublicSite, WebhookPublicSite } from './webhook-public-site';

// Valor de prueba, no un secreto: el HMAC solo pide que coincida de los dos lados.
const SECRET = 'test-'.repeat(8);
const PROPERTY_ID = '00000000-0000-7000-8000-0000000000c1';

describe('WebhookPublicSite', () => {
  it('posts the property id signed with the shared secret', async () => {
    const requests: { url: string; body: string; signature: string | null }[] = [];
    const site = new WebhookPublicSite({
      url: 'https://norde.example/api/revalidate',
      secret: SECRET,
      fetch: (url, init) => {
        requests.push({
          url: url instanceof Request ? url.url : url.toString(),
          body: typeof init?.body === 'string' ? init.body : '',
          signature: new Headers(init?.headers).get('x-norde-signature'),
        });
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    });

    await site.revalidateProperty(PROPERTY_ID);

    const body = JSON.stringify({ propertyId: PROPERTY_ID });
    expect(requests).toEqual([
      {
        url: 'https://norde.example/api/revalidate',
        body,
        signature: `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`,
      },
    ]);
  });

  it('throws when the site answers with an error, so the job retries', async () => {
    const site = new WebhookPublicSite({
      url: 'https://norde.example/api/revalidate',
      secret: SECRET,
      fetch: () => Promise.resolve(new Response(null, { status: 503 })),
    });
    await expect(site.revalidateProperty(PROPERTY_ID)).rejects.toThrow('503');
  });
});

describe('LogPublicSite', () => {
  it('only logs the property id', async () => {
    const logged: object[] = [];
    const site = new LogPublicSite({
      info: (details) => logged.push(details),
      warn: () => undefined,
      error: () => undefined,
    });
    await site.revalidateProperty(PROPERTY_ID);
    expect(logged).toEqual([{ propertyId: PROPERTY_ID }]);
  });
});
