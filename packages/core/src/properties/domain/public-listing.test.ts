import { describe, expect, it } from 'vitest';

import {
  isPublicImage,
  isPublicLink,
  primaryOperation,
  publicAddress,
  publicCoordinates,
  publicImageKey,
  publicPrice,
  type PublicMediaSource,
} from './public-listing';

describe('publicPrice', () => {
  const operation = { priceCents: 15_000_000n, priceOnRequest: false };

  it('shows the price when nothing hides it', () => {
    expect(publicPrice(operation, true)).toBe(15_000_000n);
  });

  it('hides it when the property does not show prices on the web', () => {
    expect(publicPrice(operation, false)).toBeNull();
  });

  it('hides it when the operation is "price on request" or has no price', () => {
    expect(publicPrice({ ...operation, priceOnRequest: true }, true)).toBeNull();
    expect(publicPrice({ priceCents: null, priceOnRequest: false }, true)).toBeNull();
  });
});

describe('primaryOperation', () => {
  const rent = { operation: 'rent' as const };
  const sale = { operation: 'sale' as const };

  it('prefers the searched operation', () => {
    expect(primaryOperation([sale, rent], 'rent')).toBe(rent);
  });

  it('falls back to the catalog order when the searched one is not offered', () => {
    expect(primaryOperation([rent, sale])).toBe(sale);
    expect(primaryOperation([rent], 'temporary_rent')).toBe(rent);
  });

  it('returns undefined without operations', () => {
    expect(primaryOperation<typeof sale>([])).toBeUndefined();
  });
});

describe('publicAddress', () => {
  const property = {
    address: 'Gurruchaga 1834',
    showExactAddress: true,
    publishAddress: 'Gurruchaga al 1800',
  };

  it('shows the exact address when allowed', () => {
    expect(publicAddress(property)).toBe('Gurruchaga 1834');
  });

  it('shows the approximate address otherwise', () => {
    expect(publicAddress({ ...property, showExactAddress: false })).toBe('Gurruchaga al 1800');
  });

  it('falls back to the approximate one when the exact one is empty', () => {
    expect(publicAddress({ ...property, address: '  ' })).toBe('Gurruchaga al 1800');
  });

  it('returns null when there is nothing to publish', () => {
    expect(
      publicAddress({ address: 'Gurruchaga 1834', showExactAddress: false, publishAddress: null }),
    ).toBeNull();
  });
});

describe('publicCoordinates', () => {
  const property = { latitude: -34.588123, longitude: -58.430987, showExactAddress: true };

  it('keeps the exact pin when the exact address is public', () => {
    expect(publicCoordinates(property)).toEqual({
      latitude: -34.588123,
      longitude: -58.430987,
      exact: true,
    });
  });

  it('rounds to the block otherwise', () => {
    expect(publicCoordinates({ ...property, showExactAddress: false })).toEqual({
      latitude: -34.588,
      longitude: -58.431,
      exact: false,
    });
  });

  it('returns null without coordinates', () => {
    expect(publicCoordinates({ ...property, latitude: null })).toBeNull();
  });
});

describe('public media', () => {
  const photo: PublicMediaSource = {
    kind: 'photo',
    storageKey: 'media/original',
    externalUrl: null,
    showOnWeb: true,
    processing: 'ready',
    variants: { thumbnail: 'media/thumb', web: 'media/web' },
  };

  it('publishes the web version, or the watermarked one when there is one', () => {
    expect(publicImageKey(photo)).toBe('media/web');
    expect(publicImageKey({ ...photo, variants: { web: 'w', watermarked: 'wm' } })).toBe('wm');
    expect(isPublicImage(photo)).toBe(true);
  });

  it('never publishes the original, hidden photos or photos still processing', () => {
    expect(publicImageKey({ ...photo, variants: {} })).toBeUndefined();
    expect(isPublicImage({ ...photo, showOnWeb: false })).toBe(false);
    expect(isPublicImage({ ...photo, processing: 'pending' })).toBe(false);
    expect(isPublicImage({ ...photo, processing: 'failed' })).toBe(false);
  });

  it('publishes imported photos by their https link', () => {
    const imported = { ...photo, storageKey: null, variants: {} };
    expect(isPublicImage({ ...imported, externalUrl: 'https://example.com/a.jpg' })).toBe(true);
    expect(isPublicImage({ ...imported, externalUrl: 'http://example.com/a.jpg' })).toBe(false);
    expect(publicImageKey({ ...imported, externalUrl: 'https://example.com/a.jpg' })).toBe(
      undefined,
    );
  });

  it('publishes videos and tours that are not hidden', () => {
    const video: PublicMediaSource = {
      ...photo,
      kind: 'video',
      storageKey: null,
      externalUrl: 'https://youtu.be/abc',
      variants: {},
    };
    expect(isPublicLink(video)).toBe(true);
    expect(isPublicLink({ ...video, showOnWeb: false })).toBe(false);
    expect(isPublicLink(photo)).toBe(false);
    expect(isPublicImage(video)).toBe(false);
  });
});
