import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { WebChatClient } from './web-chat-client';
import { WebChatMessenger } from './web-chat-messenger';

// Valor de prueba, no un secreto: el HMAC solo pide que coincida de los dos lados.
const SECRET = 'test-'.repeat(8);
const URL = 'http://127.0.0.1:3100/chat/messages';
const message = {
  sessionId: '00000000-0000-4000-8000-0000000000a1',
  messageId: '00000000-0000-4000-8000-0000000000b1',
  text: 'Busco un 2 ambientes en Palermo',
};
const reply = { text: '¡Hola! Tengo estas opciones.', photoUrl: null, buttons: [] };

function clientAnswering(status: number, body: unknown = {}) {
  const requests: { body: string; signature: string | null }[] = [];
  const client = new WebChatClient({
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

describe('WebChatClient', () => {
  it('posts the message signed with the shared secret and returns the reply', async () => {
    const { client, requests } = clientAnswering(200, { reply });
    expect(await client.send(message)).toEqual({ kind: 'reply', reply });
    const body = JSON.stringify(message);
    expect(requests).toEqual([
      { body, signature: `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}` },
    ]);
  });

  it('returns an empty reply when the agent stays silent', async () => {
    const { client } = clientAnswering(200, { reply: null });
    expect(await client.send(message)).toEqual({ kind: 'reply', reply: null });
  });

  it('maps 429 to busy and 503 to unavailable', async () => {
    expect(await clientAnswering(429).client.send(message)).toEqual({ kind: 'busy' });
    expect(await clientAnswering(503).client.send(message)).toEqual({ kind: 'unavailable' });
  });

  it('throws on any other error or on an unexpected body', async () => {
    await expect(clientAnswering(401).client.send(message)).rejects.toThrow('401');
    await expect(
      clientAnswering(200, { reply: { text: 1 } }).client.send(message),
    ).rejects.toThrow();
  });
});

describe('WebChatMessenger', () => {
  it('accepts every reply without a channel message id', async () => {
    const sent = await new WebChatMessenger().send('session', { type: 'text', text: 'Hola' });
    expect(sent.isOk() && sent.value).toEqual({ channelMessageId: undefined });
  });
});
