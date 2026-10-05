import { describe, expect, it } from 'vitest';

import { isPubliclyListed, PROPERTY_STATUSES } from './property-status';

describe('isPubliclyListed', () => {
  it('lists only available properties published on the web', () => {
    expect(isPubliclyListed({ status: 'available', publishedOnWeb: true })).toBe(true);
    expect(isPubliclyListed({ status: 'available', publishedOnWeb: false })).toBe(false);
  });

  it.each(PROPERTY_STATUSES.filter((s) => s !== 'available'))('does not list %s', (status) => {
    expect(isPubliclyListed({ status, publishedOnWeb: true })).toBe(false);
  });
});
