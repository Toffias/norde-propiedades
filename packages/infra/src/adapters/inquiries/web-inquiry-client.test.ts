import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { WebInquiryClient } from './web-inquiry-client';

// Valor de prueba, no un secreto: el HMAC solo pide que coincida de los dos lados.
const SECRET = 'test-'.repeat(8);
const URL = 'https://gestion.example/api/webhooks/inquiries/web';
const inquiry = {
  externalId: '00000000-0000-7000-8000-0000000000e1',
  name: 'Ana',
  phone: '+5491166899124',
  message: 'Quiero visitarla',
  propertyId: '00000000-0000-7000-8000-0000000000c1',
};

function clientAnswering(status: number, body: unknown = {}) {
  const requests: { body: string; signature: string | null }[] = [];
  const client = new WebInquiryClient({
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

describe('WebInquiryClient', () => {
  it('posts the inquiry signed with the shared secret', async () => {
    const { client, requests } = clientAnswering(201, { inquiryId: 'x', duplicate: false });
    expect(await client.send(inquiry)).toEqual({ kind: 'received' });
    const body = JSON.stringify(inquiry);
    expect(requests).toEqual([
      { body, signature: `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}` },
    ]);
  });

  it('reports the data gestion rejected and when it is busy', async () => {
    expect(await clientAnswering(422, { error: 'InvalidPhone' }).client.send(inquiry)).toEqual({
      kind: 'rejected',
      reason: 'InvalidPhone',
    });
    expect(await clientAnswering(429).client.send(inquiry)).toEqual({ kind: 'busy' });
  });

  it('throws on any other error', async () => {
    await expect(clientAnswering(500).client.send(inquiry)).rejects.toThrow('500');
    await expect(clientAnswering(401).client.send(inquiry)).rejects.toThrow('401');
  });
});
