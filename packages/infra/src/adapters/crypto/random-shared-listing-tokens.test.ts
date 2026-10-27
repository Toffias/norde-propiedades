import { SharedListingTokenSchema } from '@norde/core/clients/contracts';
import { describe, expect, it } from 'vitest';

import { RandomSharedListingTokens } from './random-shared-listing-tokens';

describe('RandomSharedListingTokens', () => {
  it('issues different link-safe tokens and stores only their hash', () => {
    const tokens = new RandomSharedListingTokens();
    const first = tokens.issue();
    const second = tokens.issue();

    expect(SharedListingTokenSchema.safeParse(first.token).success).toBe(true);
    expect(first.token).not.toBe(second.token);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.hash).not.toContain(first.token);
    expect(tokens.hashOf(first.token)).toBe(first.hash);
  });
});
