import { describe, expect, it } from 'vitest';

import { maskEmail, maskPhone } from '../shared/logger';

import { fromJsonb, toJsonb } from './json';

describe('jsonb conversion', () => {
  it('round-trips bigint values', () => {
    const value = { price: 15_000_000n, nested: [{ cents: 1n }], name: 'x' };

    const stored = JSON.parse(JSON.stringify(toJsonb(value))) as unknown;

    expect(fromJsonb(stored)).toEqual(value);
  });

  it('drops undefined fields and stores dates as ISO text', () => {
    expect(toJsonb({ a: undefined, at: new Date('2026-03-01T10:00:00Z') })).toEqual({
      at: '2026-03-01T10:00:00.000Z',
    });
  });
});

describe('masking', () => {
  it('masks phones and emails for logs', () => {
    expect(maskPhone('+5491166899124')).toBe('+549********24');
    expect(maskEmail('ana.perez@mail.com')).toBe('a***@mail.com');
    expect(maskPhone('123')).toBe('***');
  });
});
