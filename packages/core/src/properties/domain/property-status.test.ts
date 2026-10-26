import { describe, expect, it } from 'vitest';

import { isPubliclyListed, isUnreleased, PROPERTY_STATUSES } from './property-status';

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
