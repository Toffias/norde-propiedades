import { describe, expect, it } from 'vitest';

import { Email, parseId } from '../../shared';
import { unwrap, unwrapErr } from '../../shared/testing';

import { SearchSubscription } from './search-subscription';

const NOW = new Date('2026-11-04T15:00:00Z');
const HOUR = 60 * 60 * 1000;

function idOf<T extends string>(raw: string) {
  return unwrap(parseId<T>(raw));
}

function aSubscription(
  overrides: { readonly minPriceCents?: bigint; readonly summary?: string } = {},
) {
  return SearchSubscription.request({
    id: idOf<'SearchSubscription'>('00000000-0000-7000-8000-0000000000a1'),
    tokenHash: 'hash:tok',
    name: '  Ana   Pérez ',
    email: unwrap(Email.create('ana@example.com')),
    criteria: {
      operation: 'sale',
      propertyTypes: ['apartment', 'apartment'],
      currency: 'USD',
      minPriceCents: overrides.minPriceCents,
      maxPriceCents: 15_000_000n,
      locationIds: [],
      minRooms: 2,
    },
    summary: overrides.summary ?? 'Departamentos en venta',
    frequency: 'weekly',
    now: NOW,
  });
}

const CONFIRMED = {
  clientId: idOf<'Client'>('00000000-0000-7000-8000-0000000000c1'),
  savedSearchId: idOf<'SavedSearch'>('00000000-0000-7000-8000-0000000000d1'),
  agentId: 'user-camila',
};

describe('SearchSubscription', () => {
  it('is requested pending for 72 hours with clean criteria', () => {
    const subscription = unwrap(aSubscription());

    expect(subscription.toSnapshot()).toMatchObject({
      contact: { name: 'Ana Pérez' },
      criteria: { propertyTypes: ['apartment'] },
      expiresAt: new Date(NOW.getTime() + 72 * HOUR),
      confirmedAt: undefined,
    });
  });

  it('rejects invalid criteria', () => {
    expect(unwrapErr(aSubscription({ minPriceCents: 20_000_000n }))).toEqual({
      type: 'InvalidSavedSearch',
      reason: 'price_range',
    });
  });

  it('saves the search with auto-send, its frequency and the summary as name', () => {
    const long =
      'Departamentos y casas en venta en Palermo, Belgrano, Núñez y Colegiales, de USD 100.000 a USD 150.000';
    const subscription = unwrap(aSubscription({ summary: long }));

    const fields = subscription.savedSearchFields();

    expect(fields).toMatchObject({ autoSend: true, frequency: 'weekly', operation: 'sale' });
    expect(fields.name?.length).toBe(80);
    expect(fields.name?.endsWith('…')).toBe(true);
  });

  it('confirms once, forgets the name and email, and announces it', () => {
    const subscription = unwrap(aSubscription());

    expect(unwrap(subscription.confirm(CONFIRMED, NOW))).toBe(true);
    expect(unwrap(subscription.confirm(CONFIRMED, NOW))).toBe(false);

    expect(subscription.contact).toBeUndefined();
    expect(subscription.toSnapshot()).toMatchObject({
      clientId: CONFIRMED.clientId,
      savedSearchId: CONFIRMED.savedSearchId,
      confirmedAt: NOW,
    });
    const [event] = subscription.pullEvents();
    expect(event?.type).toBe('clients.search_subscribed');
    expect(event?.payload).toEqual({
      subscriptionId: subscription.id,
      clientId: CONFIRMED.clientId,
      savedSearchId: CONFIRMED.savedSearchId,
      agentId: 'user-camila',
    });
  });

  it('cannot be confirmed after it expired', () => {
    const subscription = unwrap(aSubscription());
    const later = new Date(NOW.getTime() + 72 * HOUR);

    expect(subscription.isExpired(later)).toBe(true);
    expect(unwrapErr(subscription.confirm(CONFIRMED, later))).toEqual({
      type: 'SearchSubscriptionExpired',
    });
  });
});
