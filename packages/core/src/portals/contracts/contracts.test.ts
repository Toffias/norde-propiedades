import { describe, expect, it } from 'vitest';

import {
  LISTING_INTENTS,
  LISTING_OPERATIONS,
  LISTING_STATUSES,
  LISTING_TYPES,
} from '../domain/listing';
import { LISTING_OWNER_KINDS, LISTING_SCOPES, PORTALS } from '../domain/portal';

import {
  ConnectPortalAccountInputSchema,
  LISTING_INTENT_VALUES,
  LISTING_OPERATION_VALUES,
  LISTING_OWNER_KIND_VALUES,
  LISTING_SCOPE_VALUES,
  LISTING_STATUS_VALUES,
  LISTING_TYPE_VALUES,
  PORTAL_VALUES,
  PortalPlanSchema,
} from './index';

describe('portals contracts', () => {
  it('mirror the domain values', () => {
    expect(PORTAL_VALUES).toEqual(PORTALS);
    expect(LISTING_OWNER_KIND_VALUES).toEqual(LISTING_OWNER_KINDS);
    expect(LISTING_SCOPE_VALUES).toEqual(LISTING_SCOPES);
  });

  it('accept only portal plan codes', () => {
    expect(PortalPlanSchema.safeParse('SIMPLE').success).toBe(true);
    expect(PortalPlanSchema.safeParse('DESARROLLOS_HOME').success).toBe(true);
    expect(PortalPlanSchema.safeParse('simple').success).toBe(false);
    expect(PortalPlanSchema.safeParse('').success).toBe(false);
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

describe('listing contracts', () => {
  it('mirror the domain values', () => {
    expect(LISTING_STATUS_VALUES).toEqual(LISTING_STATUSES);
    expect(LISTING_INTENT_VALUES).toEqual(LISTING_INTENTS);
    expect(LISTING_TYPE_VALUES).toEqual(LISTING_TYPES);
    expect(LISTING_OPERATION_VALUES).toEqual(LISTING_OPERATIONS);
  });
});
