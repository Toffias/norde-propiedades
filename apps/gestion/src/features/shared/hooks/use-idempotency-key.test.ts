import { idempotencyKeySchema } from '@norde/core/shared/contracts';
import { describe, expect, it } from 'vitest';

import { newIdempotencyKey } from './use-idempotency-key';

describe('newIdempotencyKey', () => {
  it('builds a UUID v4 that the actions accept', () => {
    const key = newIdempotencyKey();

    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(idempotencyKeySchema.safeParse(key).success).toBe(true);
  });

  it('sets the version and variant bits over any random bytes', () => {
    expect(newIdempotencyKey((values) => values.fill(0xff))).toBe(
      'ffffffff-ffff-4fff-bfff-ffffffffffff',
    );
  });

  it('gives a different key each time', () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});
