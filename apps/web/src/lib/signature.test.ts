import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { verifySignature } from './signature';

// Valor de prueba, no un secreto: el HMAC solo pide que coincida de los dos lados.
const SECRET = 'test-'.repeat(8);
const body = Buffer.from('{"propertyId":"x"}');
const signed = `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;

describe('verifySignature', () => {
  it('accepts the HMAC of the raw body', () => {
    expect(verifySignature(body, signed, SECRET)).toBe(true);
  });

  it.each([
    ['no header', null],
    ['another scheme', signed.replace('sha256=', 'sha1=')],
    ['a truncated signature', signed.slice(0, -2)],
    ['another secret', `sha256=${createHmac('sha256', 'otro').update(body).digest('hex')}`],
  ])('rejects %s', (_, header) => {
    expect(verifySignature(body, header, SECRET)).toBe(false);
  });

  it('rejects a body changed after signing', () => {
    expect(verifySignature(Buffer.from('{"propertyId":"y"}'), signed, SECRET)).toBe(false);
  });
});
