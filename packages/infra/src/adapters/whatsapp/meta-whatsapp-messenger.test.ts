import { describe, expect, it } from 'vitest';

import { MetaWhatsAppMessenger, stripArgentineNine, truncate } from './meta-whatsapp-messenger';

interface Call {
  readonly url: string;
  readonly body: Record<string, unknown>;
  readonly authorization: string | null;
}

function fakeFetch(responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    calls.push({
      url: input instanceof Request ? input.url : input.toString(),
      body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
        string,
        unknown
      >,
      authorization: new Headers(init?.headers).get('authorization'),
    });
    const next = responses.shift() ?? new Response('{}', { status: 200 });
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
  return { calls, fetchImpl };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };

function messenger(fetchImpl: typeof fetch, stripNine = false) {
  return new MetaWhatsAppMessenger({
    accessToken: 'token-123',
    phoneNumberId: 'PNID',
    apiVersion: 'v23.0',
    baseUrl: 'https://graph.example.com',
    stripArgentineNine: stripNine,
    logger: silent,
    fetch: fetchImpl,
    retryDelayMs: 0,
  });
}

describe('MetaWhatsAppMessenger', () => {
  it('sends a text with link preview and returns the message id', async () => {
    const { calls, fetchImpl } = fakeFetch([json({ messages: [{ id: 'wamid.OUT' }] })]);

    const result = await messenger(fetchImpl).send('5491166899124', { type: 'text', text: 'Hola' });

    expect(result.isOk() && result.value).toEqual({ channelMessageId: 'wamid.OUT' });
    expect(calls[0]?.url).toBe('https://graph.example.com/v23.0/PNID/messages');
    expect(calls[0]?.authorization).toBe('Bearer token-123');
    expect(calls[0]?.body).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '5491166899124',
      type: 'text',
      text: { preview_url: true, body: 'Hola' },
    });
  });

  it('builds image and button payloads within the API limits', async () => {
    const { calls, fetchImpl } = fakeFetch([json({}), json({})]);
    const client = messenger(fetchImpl);

    await client.send('1', { type: 'image', imageUrl: 'https://x.com/a.jpg', caption: 'Foto' });
    await client.send('1', {
      type: 'buttons',
      text: '¿Qué preferís?',
      buttons: [
        { id: 'opt_1', title: 'Comprar' },
        { id: 'opt_2', title: 'Alquilar' },
      ],
    });

    expect(calls[0]?.body).toMatchObject({
      type: 'image',
      image: { link: 'https://x.com/a.jpg', caption: 'Foto' },
    });
    expect(calls[1]?.body).toMatchObject({
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: '¿Qué preferís?' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'opt_1', title: 'Comprar' } },
            { type: 'reply', reply: { id: 'opt_2', title: 'Alquilar' } },
          ],
        },
      },
    });
  });

  it('never retries a 4xx (it could be charged twice)', async () => {
    const { calls, fetchImpl } = fakeFetch([
      json({ error: { code: 131047, message: 'Re-engagement message' } }, 400),
    ]);

    const result = await messenger(fetchImpl).send('1', { type: 'text', text: 'Hola' });

    expect(result.isErr() && result.error).toEqual({
      type: 'DeliveryFailed',
      reason: 'whatsapp http 400 code 131047',
    });
    expect(calls).toHaveLength(1);
  });

  it('retries once on 5xx, 429 and network errors', async () => {
    const fiveHundred = fakeFetch([json({}, 503), json({ messages: [{ id: 'wamid.2' }] })]);
    const network = fakeFetch([new Error('ECONNRESET'), json({ messages: [{ id: 'wamid.3' }] })]);
    const twice = fakeFetch([json({}, 429), json({}, 429)]);

    const recovered = await messenger(fiveHundred.fetchImpl).send('1', { type: 'text', text: 'a' });
    const reconnected = await messenger(network.fetchImpl).send('1', { type: 'text', text: 'a' });
    const failed = await messenger(twice.fetchImpl).send('1', { type: 'text', text: 'a' });

    expect(recovered.isOk()).toBe(true);
    expect(fiveHundred.calls).toHaveLength(2);
    expect(reconnected.isOk()).toBe(true);
    expect(failed.isErr()).toBe(true);
    expect(twice.calls).toHaveLength(2);
  });

  it('reports an unreachable API without throwing', async () => {
    const { fetchImpl } = fakeFetch([new Error('down'), new Error('still down')]);

    const result = await messenger(fetchImpl).send('1', { type: 'text', text: 'a' });

    expect(result.isErr() && result.error.reason).toBe('whatsapp unreachable');
  });

  it('strips the Argentine 9 only when enabled (Meta test number)', async () => {
    const { calls, fetchImpl } = fakeFetch([json({}), json({})]);

    await messenger(fetchImpl, true).send('5491166899124', { type: 'text', text: 'a' });
    await messenger(fetchImpl, false).send('5491166899124', { type: 'text', text: 'a' });

    expect(calls.map((c) => c.body.to)).toEqual(['541166899124', '5491166899124']);
  });

  it('marks messages as read and swallows failures of that best-effort call', async () => {
    const { calls, fetchImpl } = fakeFetch([json({}, 500), json({}, 500)]);

    await messenger(fetchImpl).markAsRead('wamid.IN');

    expect(calls[0]?.body).toMatchObject({ status: 'read', message_id: 'wamid.IN' });
  });
});

describe('helpers', () => {
  it('stripArgentineNine only touches Argentine mobiles', () => {
    expect(stripArgentineNine('5491166899124')).toBe('541166899124');
    expect(stripArgentineNine('541145551234')).toBe('541145551234');
    expect(stripArgentineNine('34612345678')).toBe('34612345678');
  });

  it('truncate keeps the limit including the ellipsis', () => {
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('abc', 4)).toBe('abc');
  });
});
