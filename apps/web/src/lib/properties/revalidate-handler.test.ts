import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createRevalidateHandler } from './revalidate-handler';

// Valor de prueba, no un secreto: el HMAC solo pide que coincida de los dos lados.
const SECRET = 'test-'.repeat(8);
const PROPERTY_ID = '00000000-0000-7000-8000-0000000000c1';

function sign(body: string, secret = SECRET) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

function setup() {
  const tags: string[] = [];
  const handle = createRevalidateHandler({
    secret: SECRET,
    revalidateTag: (tag) => tags.push(tag),
  });
  const post = (body: string, signature: string | null = sign(body)) =>
    handle(
      new Request('http://localhost:3000/api/revalidate', {
        method: 'POST',
        body,
        headers: signature ? { 'x-norde-signature': signature } : {},
      }),
    );
  return { tags, post };
}

describe('POST /api/revalidate', () => {
  it('invalidates the property page and the listings', async () => {
    const { tags, post } = setup();
    const response = await post(JSON.stringify({ propertyId: PROPERTY_ID }));
    expect(response.status).toBe(200);
    expect(tags).toEqual([`property:${PROPERTY_ID}`, 'properties']);
  });

  it('rejects a missing or wrong signature without touching the cache', async () => {
    const { tags, post } = setup();
    const body = JSON.stringify({ propertyId: PROPERTY_ID });
    expect((await post(body, null)).status).toBe(401);
    expect((await post(body, sign(body, 'otro-secreto'))).status).toBe(401);
    expect(tags).toEqual([]);
  });

  it('rejects a signed body that is not a property id', async () => {
    const { tags, post } = setup();
    expect((await post('no es json')).status).toBe(400);
    expect((await post(JSON.stringify({ propertyId: '../x' }))).status).toBe(400);
    expect(tags).toEqual([]);
  });

  it('rejects a body larger than a notice', async () => {
    const { post } = setup();
    expect((await post(JSON.stringify({ propertyId: 'x'.repeat(2000) }))).status).toBe(413);
  });
});
