import { describe, expect, it } from 'vitest';

import { parseId, Phone } from '../../shared';
import { unwrap, unwrapErr } from '../../shared/testing';

import type { ClientId } from './client';
import { automaticRuleFor } from './opportunity-settings';
import {
  MAX_SHARED_PROPERTIES,
  SharedListing,
  sharedListingUrl,
  whatsappMessageUrl,
  whatsappNumber,
  type SharedListingId,
} from './shared-listing';

const ID = unwrap(parseId<'SharedListing'>('00000000-0000-7000-8000-0000000000a1'));
const CLIENT_ID = unwrap(parseId<'Client'>('00000000-0000-7000-8000-0000000000a2'));
const P1 = '00000000-0000-7000-8000-0000000000e1';
const P2 = '00000000-0000-7000-8000-0000000000e2';
const SENT_AT = new Date('2026-03-01T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function send(
  overrides: Partial<{
    readonly id: SharedListingId;
    readonly clientId: ClientId;
    readonly propertyIds: readonly string[];
    readonly opportunityId: string | undefined;
  }> = {},
) {
  return SharedListing.send({
    id: ID,
    tokenHash: 'hash',
    clientId: CLIENT_ID,
    opportunityId: 'opp-1',
    channel: 'email',
    propertyIds: [P1, P2],
    by: 'user-1',
    now: SENT_AT,
    ...overrides,
  });
}

describe('SharedListing', () => {
  it('sends the properties once each, in order, for 90 days', () => {
    const listing = unwrap(send({ propertyIds: [P2, P1, P2.toUpperCase()] }));

    const snapshot = listing.toSnapshot();
    expect(snapshot.items.map((i) => [i.propertyId, i.position])).toEqual([
      [P2, 0],
      [P1, 1],
    ]);
    expect(snapshot.expiresAt).toEqual(new Date(SENT_AT.getTime() + 90 * DAY));
    expect(listing.pullEvents()).toMatchObject([
      { type: 'clients.listings_sent', payload: { opportunityId: 'opp-1', propertyIds: [P2, P1] } },
    ]);
  });

  it('needs at least one property and allows a maximum', () => {
    expect(unwrapErr(send({ propertyIds: [] }))).toEqual({ type: 'NoListingsToSend' });
    const many = Array.from(
      { length: MAX_SHARED_PROPERTIES + 1 },
      (_, i) => `00000000-0000-7000-8000-${i.toString().padStart(12, '0')}`,
    );
    expect(unwrapErr(send({ propertyIds: many }))).toEqual({
      type: 'TooManyListings',
      max: MAX_SHARED_PROPERTIES,
    });
  });

  it('counts the opens and tells the first one apart', () => {
    const listing = unwrap(send());
    const later = new Date(SENT_AT.getTime() + DAY);

    expect(unwrap(listing.open(SENT_AT))).toEqual({ first: true });
    expect(unwrap(listing.open(later))).toEqual({ first: false });

    const item = listing.toSnapshot().items[0];
    expect(item?.openCount).toBe(2);
    expect(item?.firstOpenedAt).toEqual(SENT_AT);
  });

  it('records a reaction per property, which can change, and ignores a repeat', () => {
    const listing = unwrap(send());
    listing.pullEvents();

    expect(unwrap(listing.react(P1, 'liked', SENT_AT))).toBe(true);
    expect(unwrap(listing.react(P1, 'liked', SENT_AT))).toBe(false);
    expect(unwrap(listing.react(P1, 'disliked', SENT_AT))).toBe(true);
    expect(unwrapErr(listing.react(CLIENT_ID, 'liked', SENT_AT))).toEqual({
      type: 'ListingNotInSend',
    });

    expect(listing.toSnapshot().items[0]?.reaction).toBe('disliked');
    expect(listing.pullEvents().map((e) => e.type)).toEqual([
      'clients.listing_reacted',
      'clients.listing_reacted',
    ]);
  });

  it('cannot be opened or reacted to once expired or revoked', () => {
    const expired = unwrap(send());
    const after = new Date(SENT_AT.getTime() + 90 * DAY);
    expect(expired.availability(after)).toBe('expired');
    expect(unwrapErr(expired.open(after))).toEqual({
      type: 'SharedListingUnavailable',
      reason: 'expired',
    });

    const revoked = unwrap(send());
    expect(revoked.revoke(SENT_AT)).toBe(true);
    expect(revoked.revoke(SENT_AT)).toBe(false);
    expect(revoked.availability(after)).toBe('revoked');
    expect(unwrapErr(revoked.react(P1, 'liked', SENT_AT))).toEqual({
      type: 'SharedListingUnavailable',
      reason: 'revoked',
    });
  });
});

describe('shared listing links', () => {
  it('builds the public link without a double slash', () => {
    expect(sharedListingUrl('https://norde.com.ar/', 'abc_-1')).toBe(
      'https://norde.com.ar/e/abc_-1',
    );
  });

  it('adds the mobile 9 to an Argentine number for WhatsApp', () => {
    expect(whatsappNumber(unwrap(Phone.create('11 6689-9124')))).toBe('5491166899124');
    expect(whatsappNumber(unwrap(Phone.create('+54 9 11 6689-9124')))).toBe('5491166899124');
    expect(whatsappNumber(unwrap(Phone.create('+34 612 345 678')))).toBe('34612345678');
  });

  it('writes the message in the wa.me link', () => {
    expect(whatsappMessageUrl(unwrap(Phone.create('+5491166899124')), 'Hola & chau')).toBe(
      'https://wa.me/5491166899124?text=Hola%20%26%20chau',
    );
  });
});

describe('send and reaction rules', () => {
  it('apply to open opportunities only', () => {
    expect(automaticRuleFor({ kind: 'listings_sent' }, 'contacted')).toBe('afterMessage');
    expect(automaticRuleFor({ kind: 'listing_reacted', reaction: 'liked' }, 'visiting')).toBe(
      'afterLike',
    );
    expect(automaticRuleFor({ kind: 'listing_reacted', reaction: 'disliked' }, 'new')).toBe(
      'afterDislike',
    );
    expect(automaticRuleFor({ kind: 'listings_sent' }, 'won')).toBeUndefined();
  });
});
