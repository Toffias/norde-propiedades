import { describe, expect, it } from 'vitest';

import {
  isListedFor,
  isListedOnWeb,
  isPubliclyListed,
  isUnreleased,
  PROPERTY_STATUSES,
} from './property-status';

describe('isPubliclyListed', () => {
  it('lists only available properties published on the web', () => {
    expect(isPubliclyListed({ status: 'available', publishedOnWeb: true })).toBe(true);
    expect(isPubliclyListed({ status: 'available', publishedOnWeb: false })).toBe(false);
  });

  it.each(PROPERTY_STATUSES.filter((s) => s !== 'available'))('does not list %s', (status) => {
    expect(isPubliclyListed({ status, publishedOnWeb: true })).toBe(false);
  });
});

describe('isUnreleased', () => {
  it('treats only drafts as never offered to the public', () => {
    expect(isUnreleased({ status: 'draft' })).toBe(true);
    for (const status of PROPERTY_STATUSES.filter((s) => s !== 'draft')) {
      expect(isUnreleased({ status })).toBe(false);
    }
  });
});

describe('isListedOnWeb', () => {
  it('keeps a reserved property on the web, with the available ones', () => {
    expect(isListedOnWeb({ status: 'available', publishedOnWeb: true })).toBe(true);
    expect(isListedOnWeb({ status: 'reserved', publishedOnWeb: true })).toBe(true);
    expect(isListedOnWeb({ status: 'reserved', publishedOnWeb: false })).toBe(false);
  });

  it.each(PROPERTY_STATUSES.filter((s) => s !== 'available' && s !== 'reserved'))(
    'does not show %s',
    (status) => {
      expect(isListedOnWeb({ status, publishedOnWeb: true })).toBe(false);
    },
  );

  it('offers a reserved property to the web, not to the AI agent', () => {
    const reserved = { status: 'reserved' as const, publishedOnWeb: true };
    expect(isListedFor('web', reserved)).toBe(true);
    expect(isListedFor('offer', reserved)).toBe(false);
  });
});
