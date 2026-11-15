import { describe, expect, it } from 'vitest';

import { isListingSlug } from './listing-slug';

describe('isListingSlug', () => {
  it('accepts what propertySlug generates', () => {
    expect(isListingSlug('departamento-en-venta-en-palermo-nor123')).toBe(true);
    expect(isListingSlug('nor123')).toBe(true);
  });

  it('rejects anything propertySlug never generates', () => {
    expect(isListingSlug('')).toBe(false);
    expect(isListingSlug('Casa-en-venta')).toBe(false);
    expect(isListingSlug('casa--venta')).toBe(false);
    expect(isListingSlug('-casa')).toBe(false);
    expect(isListingSlug('casa en venta')).toBe(false);
    expect(isListingSlug('casa/../../etc')).toBe(false);
    expect(isListingSlug('a'.repeat(201))).toBe(false);
  });
});
