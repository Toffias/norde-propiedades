import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared/domain/id';
import { unwrap, unwrapErr } from '../../shared/testing';

import { Listing, ownerAvailability } from './listing';

const NOW = new Date('2026-10-06T12:00:00Z');
const LATER = new Date('2026-10-06T13:00:00Z');
const ID = unwrap(parseId<'Listing'>('01920000-0000-7000-8000-0000000000a1'));
const PROPERTY = '01920000-0000-7000-8000-0000000000b1';

function requested() {
  return Listing.request({
    id: ID,
    portal: 'mercadolibre',
    propertyId: PROPERTY,
    operation: 'sale',
    listingType: 'simple',
    now: NOW,
  });
}

/** Un aviso ya creado en el portal, con el contenido `hash-1`. */
function published() {
  const listing = requested();
  listing.recordCreated({
    externalId: 'MLA1',
    permalink: 'https://ml/1',
    contentHash: 'hash-1',
    now: NOW,
  });
  listing.pullEvents();
  return listing;
}

describe('ownerAvailability', () => {
  it.each([
    ['available', false, 'active'],
    ['reserved', false, 'paused'],
    ['paused', false, 'paused'],
    ['sold', false, 'closed'],
    ['rented', false, 'closed'],
    ['withdrawn', false, 'closed'],
    ['draft', false, 'closed'],
    ['available', true, 'closed'],
  ] as const)('%s (deleted: %s) is %s', (status, deleted, expected) => {
    expect(ownerAvailability(status, deleted)).toBe(expected);
  });
});

describe('Listing.request', () => {
  it('starts pending and asks for a sync', () => {
    const listing = requested();
    expect(listing.toSnapshot()).toMatchObject({
      status: 'pending',
      intent: 'active',
      retryCount: 0,
    });
    expect(listing.pullEvents()).toEqual([
      expect.objectContaining({
        type: 'portals.listing_sync_requested',
        payload: { listingId: ID, propertyId: PROPERTY },
      }),
    ]);
  });
});

describe('Listing.plan', () => {
  it('creates the listing when the property is available', () => {
    expect(requested().plan('active', 'hash-1')).toEqual({ kind: 'create' });
  });

  it('does nothing when the content did not change', () => {
    expect(published().plan('active', 'hash-1')).toEqual({ kind: 'none' });
  });

  it('updates when the content changed', () => {
    expect(published().plan('active', 'hash-2')).toEqual({
      kind: 'update',
      activate: false,
      contentChanged: true,
    });
  });

  it('sends everything again after an error', () => {
    const listing = published();
    listing.recordFailure('boom', NOW);
    expect(listing.plan('active', 'hash-1')).toMatchObject({
      kind: 'update',
      contentChanged: true,
    });
  });

  it('pauses the listing when the property is reserved', () => {
    expect(published().plan('paused', 'hash-1')).toEqual({ kind: 'pause', contentChanged: false });
  });

  it('pauses the listing when the team asked for it', () => {
    const listing = published();
    unwrap(listing.pause(NOW));
    expect(listing.plan('active', 'hash-1')).toEqual({ kind: 'pause', contentChanged: false });
  });

  it('reactivates a paused listing when the property is available again', () => {
    const listing = published();
    listing.recordPaused('hash-1', NOW);
    expect(listing.plan('active', 'hash-1')).toEqual({
      kind: 'update',
      activate: true,
      contentChanged: false,
    });
  });

  it('closes the listing when the property is sold', () => {
    expect(published().plan('closed', 'hash-1')).toEqual({ kind: 'close' });
  });

  it('closes the listing when the team unpublished it', () => {
    const listing = published();
    listing.unpublish(NOW);
    expect(listing.plan('active', 'hash-1')).toEqual({ kind: 'close' });
  });

  it('only marks a listing that never reached the portal', () => {
    expect(requested().plan('paused', 'hash-1')).toEqual({ kind: 'mark', status: 'paused' });
    expect(requested().plan('closed', 'hash-1')).toEqual({ kind: 'mark', status: 'unpublished' });
  });

  it('has nothing to do once closed', () => {
    const listing = published();
    listing.recordClosed(NOW);
    expect(listing.isFinished).toBe(true);
    expect(listing.plan('active', 'hash-2')).toEqual({ kind: 'none' });
  });
});

describe('Listing results', () => {
  it('records the created listing and clears the last error', () => {
    const listing = requested();
    listing.recordFailure('Sin fotos', NOW);
    listing.recordCreated({
      externalId: 'MLA1',
      permalink: 'https://ml/1',
      contentHash: 'h',
      now: LATER,
    });
    expect(listing.toSnapshot()).toMatchObject({
      status: 'published',
      externalId: 'MLA1',
      permalink: 'https://ml/1',
      lastError: undefined,
      retryCount: 0,
      publishedAt: LATER,
      lastSyncedAt: LATER,
    });
  });

  it('keeps the reason of a failure and counts it', () => {
    const listing = published();
    listing.recordFailure('Falta el WhatsApp', NOW);
    listing.recordFailure('Falta el WhatsApp', LATER);
    expect(listing.toSnapshot()).toMatchObject({
      status: 'error',
      lastError: 'Falta el WhatsApp',
      retryCount: 2,
    });
    expect(listing.pullEvents().map((event) => event.type)).toEqual([
      'portals.listing_sync_failed',
      'portals.listing_sync_failed',
    ]);
  });

  it('closes for good when the portal closed it', () => {
    const listing = published();
    listing.recordClosed(NOW);
    expect(listing.toSnapshot()).toMatchObject({ status: 'unpublished', intent: 'closed' });
  });
});

describe('Listing commands', () => {
  it('pauses and resumes, asking for a sync each time', () => {
    const listing = published();
    expect(unwrap(listing.pause(NOW))).toBe(true);
    expect(unwrap(listing.pause(NOW))).toBe(false);
    expect(unwrap(listing.resume(NOW))).toBe(true);
    expect(listing.pullEvents()).toHaveLength(2);
  });

  it('cannot pause, resume or change the type of a closed listing', () => {
    const listing = published();
    listing.unpublish(NOW);
    expect(unwrapErr(listing.pause(NOW))).toEqual({ type: 'ListingClosed' });
    expect(unwrapErr(listing.resume(NOW))).toEqual({ type: 'ListingClosed' });
    expect(unwrapErr(listing.changeType('featured', NOW))).toEqual({ type: 'ListingClosed' });
  });

  it('changes the type and forces a full update', () => {
    const listing = published();
    expect(unwrap(listing.changeType('featured', NOW))).toBe(true);
    expect(listing.toSnapshot()).toMatchObject({ listingType: 'featured', contentHash: undefined });
    expect(listing.plan('active', 'hash-1')).toMatchObject({
      kind: 'update',
      contentChanged: true,
    });
  });

  it('republishes a closed listing as a new one', () => {
    const listing = published();
    listing.recordClosed(NOW);
    listing.pullEvents();

    unwrap(listing.republish('featured', LATER));

    expect(listing.toSnapshot()).toMatchObject({
      status: 'pending',
      intent: 'active',
      listingType: 'featured',
      externalId: undefined,
      permalink: undefined,
    });
    expect(listing.plan('active', 'hash-1')).toEqual({ kind: 'create' });
    expect(listing.pullEvents()).toHaveLength(1);
  });

  it('only republishes a closed listing', () => {
    expect(unwrapErr(published().republish('simple', NOW))).toEqual({ type: 'ListingNotClosed' });
  });

  it('does not ask for a sync once finished', () => {
    const listing = published();
    listing.recordClosed(NOW);
    listing.requestSync(LATER);
    expect(listing.pullEvents()).toEqual([]);
  });
});
