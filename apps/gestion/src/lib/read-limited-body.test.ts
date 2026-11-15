import { describe, expect, it } from 'vitest';

import { readLimitedBody } from './read-limited-body';

/** Un pedido con el body en partes y sin `content-length`, como llega con `chunked`. */
function chunked(parts: readonly string[]): Request {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
  // `duplex` lo pide Node para mandar un stream como body.
  const init: RequestInit & { duplex: 'half' } = { method: 'POST', body, duplex: 'half' };
  return new Request('http://localhost/webhook', init);
}

describe('readLimitedBody', () => {
  it('returns the whole body when it fits', async () => {
    const body = await readLimitedBody(chunked(['ab', 'cd']), 4);

    expect(body?.toString('utf8')).toBe('abcd');
  });

  it('stops reading as soon as a chunked body goes past the limit', async () => {
    expect(await readLimitedBody(chunked(['ab', 'cd', 'e']), 4)).toBeUndefined();
  });

  it('refuses a declared length past the limit without reading', async () => {
    const request = new Request('http://localhost/webhook', {
      method: 'POST',
      body: 'abcdef',
      headers: { 'content-length': '6' },
    });

    expect(await readLimitedBody(request, 4)).toBeUndefined();
  });
});
