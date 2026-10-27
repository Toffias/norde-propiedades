import type { PortalAccountDirectory, PortalCredit } from '@norde/core/portals';
import { err, ok } from '@norde/core/shared';
import { unwrap, unwrapErr } from '@norde/core/shared/testing';
import { describe, expect, it } from 'vitest';

import { CachedPortalCredits } from './cached-portal-credits';

const CREDITS: readonly PortalCredit[] = [
  { plan: 'SIMPLE', available: 40, contracted: 50, publishes: 'property' },
];
const INPUT = { portal: 'zonaprop', externalAccountId: '17310373' } as const;

function setup() {
  let now = 0;
  let fail = false;
  const reads: unknown[] = [];
  const directory: PortalAccountDirectory = {
    find: () => Promise.resolve(err({ type: 'PortalAccountNotFound' as const })),
    credits: (input) => {
      reads.push(input);
      return Promise.resolve(fail ? err({ type: 'PortalUnavailable' as const }) : ok(CREDITS));
    },
  };
  const cached = new CachedPortalCredits(directory, () => now, 1000);
  return {
    cached,
    reads,
    advance: (ms: number) => (now += ms),
    failNext: () => (fail = true),
  };
}

describe('CachedPortalCredits', () => {
  it('reads the portal once within the window and again after it', async () => {
    const { cached, reads, advance } = setup();
    expect(unwrap(await cached.credits(INPUT))).toEqual(CREDITS);
    advance(999);
    unwrap(await cached.credits(INPUT));
    expect(reads).toHaveLength(1);
    advance(1);
    unwrap(await cached.credits(INPUT));
    expect(reads).toHaveLength(2);
  });

  it('does not remember a failed read', async () => {
    const { cached, reads, failNext } = setup();
    failNext();
    expect(unwrapErr(await cached.credits(INPUT))).toEqual({ type: 'PortalUnavailable' });
    unwrapErr(await cached.credits(INPUT));
    expect(reads).toHaveLength(2);
  });
});
