import { describe, expect, it } from 'vitest';

import { parseId } from '../domain/id';

import { FixedClock, SequentialIdGenerator } from './index';

describe('shared testing fakes', () => {
  it('FixedClock returns copies and advances on demand', () => {
    const clock = new FixedClock('2026-03-01T10:00:00.000Z');
    const first = clock.now();
    first.setFullYear(2000);

    clock.advance(60_000);

    expect(clock.now().toISOString()).toBe('2026-03-01T10:01:00.000Z');
  });

  it('SequentialIdGenerator produces valid, ordered ids', () => {
    const ids = new SequentialIdGenerator();
    const [a, b] = [ids.next(), ids.next()];

    expect(parseId(a).isOk()).toBe(true);
    expect(a < b).toBe(true);
  });
});
