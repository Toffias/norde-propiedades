import { describe, expect, it } from 'vitest';

import { createRateLimiter, rateLimitKey } from './rate-limit';

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

  it('counts a costly submission as several', () => {
    const allow = createRateLimiter(5, () => 0);
    expect(allow('a', 4)).toBe(true);
    expect(allow('a', 2)).toBe(false);
    expect(allow('b', 6)).toBe(false);
  });
});

describe('rateLimitKey', () => {
  it('keeps an IPv4 as it is', () => {
    expect(rateLimitKey('203.0.113.7')).toBe('203.0.113.7');
    expect(rateLimitKey(' 203.0.113.7 ')).toBe('203.0.113.7');
  });

  it('groups every IPv6 of the same /64 under one key', () => {
    const keys = [
      '2001:db8:abcd:12::1',
      '2001:0db8:abcd:0012:ffff:ffff:ffff:fffe',
      '2001:DB8:ABCD:12:1234:5678:9abc:def0',
      '[2001:db8:abcd:12::99]',
      '2001:db8:abcd:12::7%eth0',
    ].map(rateLimitKey);
    expect(new Set(keys)).toEqual(new Set(['2001:db8:abcd:12::/64']));
    expect(rateLimitKey('2001:db8:abcd:13::1')).not.toBe(keys[0]);
  });

  it('expands :: at the start of the address', () => {
    expect(rateLimitKey('::1')).toBe('0:0:0:0::/64');
  });

  it('treats an IPv4-mapped IPv6 as the IPv4', () => {
    expect(rateLimitKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('leaves anything else as it came (an empty IP shares one key)', () => {
    expect(rateLimitKey('')).toBe('');
    expect(rateLimitKey('unknown')).toBe('unknown');
  });
});
