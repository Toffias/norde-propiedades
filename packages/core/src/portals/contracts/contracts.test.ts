import { describe, expect, it } from 'vitest';

import { LISTING_OWNER_KINDS, PORTALS } from '../domain/portal';

import { ConnectPortalAccountInputSchema, LISTING_OWNER_KIND_VALUES, PORTAL_VALUES } from './index';

describe('portals contracts', () => {
  it('mirror the domain values', () => {
    expect(PORTAL_VALUES).toEqual(PORTALS);
    expect(LISTING_OWNER_KIND_VALUES).toEqual(LISTING_OWNER_KINDS);
  });

  it('require a PKCE verifier of at least 43 characters', () => {
    const input = {
      portal: 'mercadolibre',
      code: 'TG-123',
      state: 'abc',
      expectedState: 'abc',
      codeVerifier: 'x'.repeat(42),
    };
    expect(ConnectPortalAccountInputSchema.safeParse(input).success).toBe(false);
    expect(
      ConnectPortalAccountInputSchema.safeParse({ ...input, codeVerifier: 'x'.repeat(43) }).success,
    ).toBe(true);
  });
});
