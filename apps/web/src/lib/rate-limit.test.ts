import { describe, expect, it } from 'vitest';

import { createRateLimiter } from './rate-limit';

describe('createRateLimiter', () => {
  it('lets a few submissions per IP through each window', () => {
    let now = 0;
    const allow = createRateLimiter(2, () => now);
    expect([allow('a'), allow('a'), allow('a'), allow('b')]).toEqual([true, true, false, true]);
    now += 10 * 60_000;
    expect(allow('a')).toBe(true);
  });

  it('accepts a longer window, for daily limits', () => {
    let now = 0;
    const allow = createRateLimiter(1, () => now, 24 * 3_600_000);
    expect([allow('a'), allow('a')]).toEqual([true, false]);
    now += 12 * 3_600_000;
    expect(allow('a')).toBe(false);
    now += 12 * 3_600_000;
    expect(allow('a')).toBe(true);
  });
});
