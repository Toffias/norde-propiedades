import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared';
import { unwrap, unwrapErr } from '../../shared/testing';

import { MediaItem } from './media-item';
import type { MediaOwner } from './media-owner';
import { PROPERTY_STATUSES } from './property-status';
import { reservedBannerPlacement, showsReservedCover } from './reserved-cover';

const NOW = new Date('2026-11-15T12:00:00Z');
const LATER = new Date('2026-11-15T12:05:00Z');
const PROPERTY: MediaOwner = {
  kind: 'property',
  id: unwrap(parseId<'Property'>('00000000-0000-7000-8000-0000000000a1')),
};
const DEVELOPMENT: MediaOwner = {
  kind: 'development',
  id: unwrap(parseId<'Development'>('00000000-0000-7000-8000-0000000000b1')),
};

function photo(input: { readonly isCover: boolean; readonly owner?: MediaOwner }): MediaItem {
  const item = unwrap(
    MediaItem.upload({
      id: unwrap(parseId<'MediaItem'>('00000000-0000-7000-8000-0000000000c1')),
      owner: input.owner ?? PROPERTY,
      storageKey: 'media/original',
      contentType: 'image/jpeg',
      sizeBytes: 1,
      position: 0,
      isCover: input.isCover,
      uploadedBy: 'user-1',
      now: NOW,
    }),
  );
  item.pullEvents();
  return item;
}

function processed(input: { readonly isCover: boolean; readonly owner?: MediaOwner }): MediaItem {
  const item = photo(input);
  unwrap(
    item.completeProcessing({ variants: { web: 'media/web' }, width: 1600, height: 1200 }, NOW),
  );
  item.pullEvents();
  return item;
}

function requested(item: MediaItem): boolean {
  return item.pullEvents().some((event) => event.type === 'properties.reserved_cover_requested');
}

describe('showsReservedCover', () => {
  it('shows the "Reservado" cover only while reserved', () => {
    for (const status of PROPERTY_STATUSES) {
      expect(showsReservedCover(status)).toBe(status === 'reserved');
    }
  });
});

describe('reservedBannerPlacement', () => {
  it('pins the banner to the left, a fifth from the top, at 65% of the width', () => {
    expect(
      reservedBannerPlacement({ width: 1600, height: 1200 }, { width: 1200, height: 200 }),
    ).toEqual({ left: 0, top: 240, width: 1040, height: 173 });
  });

  it('keeps a tall banner within 30% of the height', () => {
    const placement = reservedBannerPlacement(
      { width: 1000, height: 1000 },
      { width: 400, height: 400 },
    );
    expect(placement).toEqual({ left: 0, top: 200, width: 300, height: 300 });
  });

  it('never goes past the bottom of a very flat photo', () => {
    const placement = reservedBannerPlacement(
      { width: 2000, height: 100 },
      { width: 10, height: 10 },
    );
    expect(placement.top + placement.height).toBeLessThanOrEqual(100);
  });
});

describe('MediaItem reserved cover', () => {
  it('asks for the "Reservado" cover once the cover of a property is processed', () => {
    const cover = photo({ isCover: true });
    unwrap(cover.completeProcessing({ variants: { web: 'media/web' }, width: 1, height: 1 }, NOW));
    expect(requested(cover)).toBe(true);
  });

  it('does not ask for it for other photos or for developments', () => {
    const other = photo({ isCover: false });
    unwrap(other.completeProcessing({ variants: { web: 'media/web' }, width: 1, height: 1 }, NOW));
    expect(requested(other)).toBe(false);

    const development = photo({ isCover: true, owner: DEVELOPMENT });
    unwrap(
      development.completeProcessing({ variants: { web: 'media/web' }, width: 1, height: 1 }, NOW),
    );
    expect(requested(development)).toBe(false);
  });

  it('asks for it when a processed photo becomes the cover', () => {
    const item = processed({ isCover: false });
    unwrap(item.markCover(true, LATER));
    expect(requested(item)).toBe(true);
  });

  it('waits for the processing when a pending photo becomes the cover', () => {
    const item = photo({ isCover: false });
    unwrap(item.markCover(true, LATER));
    expect(requested(item)).toBe(false);
  });

  it('keeps the generated cover, returns the one it replaces and changes the photo version', () => {
    const cover = processed({ isCover: true });
    expect(unwrap(cover.completeReservedCover('media/reserved-1', LATER))).toBeUndefined();
    expect(cover.toSnapshot().variants).toEqual({ web: 'media/web', reserved: 'media/reserved-1' });
    expect(cover.toSnapshot().updatedAt).toEqual(LATER);
    expect(cover.storageKeys).toContain('media/reserved-1');
    expect(unwrap(cover.completeReservedCover('media/reserved-2', LATER))).toBe('media/reserved-1');
  });

  it('rejects the generated cover if the photo is no longer the cover', () => {
    const item = processed({ isCover: false });
    expect(unwrapErr(item.completeReservedCover('media/reserved', LATER))).toEqual({
      type: 'NotReservedCover',
    });
  });

  it('drops the "Reservado" cover when the variants are generated again, and asks for a new one', () => {
    const cover = processed({ isCover: true });
    unwrap(cover.completeReservedCover('media/reserved', LATER));
    cover.pullEvents();
    unwrap(
      cover.completeProcessing({ variants: { web: 'media/web-2' }, width: 1, height: 1 }, LATER),
    );
    expect(cover.toSnapshot().variants.reserved).toBeUndefined();
    expect(requested(cover)).toBe(true);
  });
});
