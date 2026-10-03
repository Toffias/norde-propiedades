import { describe, expect, it } from 'vitest';

import { unwrap, unwrapErr } from '../../shared/testing';

import type { ClientId } from './client';
import {
  checkSavedSearchLimit,
  MAX_SAVED_SEARCHES_PER_CLIENT,
  SavedSearch,
  type SavedSearchFields,
  type SavedSearchId,
} from './saved-search';

const NOW = new Date('2026-03-10T12:00:00Z');
const LATER = new Date('2026-03-11T12:00:00Z');
const LOCATION = '00000000-0000-7000-8000-0000000000a1';

const fields: SavedSearchFields = {
  name: '  Departamento   en Palermo ',
  opportunityId: undefined,
  operation: 'sale',
  propertyTypes: ['apartment', 'apartment'],
  currency: 'USD',
  minPriceCents: 10_000_000n,
  maxPriceCents: 15_000_000n,
  locationIds: [LOCATION, LOCATION.toUpperCase()],
  minRooms: 2,
  autoSend: false,
};

function create(overrides: Partial<SavedSearchFields> = {}) {
  return SavedSearch.create({
    id: '00000000-0000-7000-8000-0000000000b1' as SavedSearchId,
    clientId: '00000000-0000-7000-8000-0000000000c1' as ClientId,
    fields: { ...fields, ...overrides },
    now: NOW,
  });
}

describe('SavedSearch', () => {
  it('normalizes the name, the types and the locations', () => {
    const search = unwrap(create());
    expect(search.fields).toEqual({
      ...fields,
      name: 'Departamento en Palermo',
      propertyTypes: ['apartment'],
      locationIds: [LOCATION],
    });
    expect(search.criteria).toEqual({
      operation: 'sale',
      propertyTypes: ['apartment'],
      currency: 'USD',
      minPriceCents: 10_000_000n,
      maxPriceCents: 15_000_000n,
      locationIds: [LOCATION],
      minRooms: 2,
    });
    expect(unwrap(create({ name: '  ' })).fields.name).toBeUndefined();
  });

  it('drops the currency without a price range', () => {
    const search = unwrap(create({ minPriceCents: undefined, maxPriceCents: undefined }));
    expect(search.fields.currency).toBeUndefined();
  });

  it('validates the price range, the rooms, the locations and the name', () => {
    const reason = (overrides: Partial<SavedSearchFields>) => {
      const error = unwrapErr(create(overrides));
      return error.reason;
    };
    expect(reason({ currency: undefined })).toBe('currency_required');
    expect(reason({ minPriceCents: -1n })).toBe('negative_price');
    expect(reason({ minPriceCents: 20_000_000n })).toBe('price_range');
    expect(reason({ minRooms: 0 })).toBe('rooms');
    expect(reason({ minRooms: 1.5 })).toBe('rooms');
    expect(reason({ minRooms: 21 })).toBe('rooms');
    expect(
      reason({
        locationIds: Array.from(
          { length: 21 },
          (_, i) => `00000000-0000-7000-8000-${String(i).padStart(12, '0')}`,
        ),
      }),
    ).toBe('too_many_locations');
    expect(reason({ name: 'x'.repeat(81) })).toBe('name_too_long');
  });

  it('edits only when something changed', () => {
    const search = unwrap(create());
    expect(unwrap(search.edit(search.fields, LATER))).toBe(false);
    expect(search.toSnapshot().updatedAt).toEqual(NOW);

    expect(unwrap(search.edit({ ...search.fields, minRooms: 3 }, LATER))).toBe(true);
    expect(search.fields.minRooms).toBe(3);
    expect(search.toSnapshot().updatedAt).toEqual(LATER);
    expect(unwrapErr(search.edit({ ...search.fields, minRooms: 0 }, LATER)).type).toBe(
      'InvalidSavedSearch',
    );
  });

  it('does not turn auto-send back on after the client unsubscribed', () => {
    const search = SavedSearch.restore({
      ...unwrap(create()).toSnapshot(),
      unsubscribedAt: NOW,
    });
    expect(unwrapErr(search.edit({ ...search.fields, autoSend: true }, LATER))).toEqual({
      type: 'SavedSearchUnsubscribed',
    });
    expect(unwrap(search.edit({ ...search.fields, name: 'Otra' }, LATER))).toBe(true);
  });

  it('goes to the trash and back once', () => {
    const search = unwrap(create());
    expect(search.delete('user-1', LATER)).toBe(true);
    expect(search.isDeleted).toBe(true);
    expect(search.toSnapshot()).toMatchObject({ deletedAt: LATER, deletedBy: 'user-1' });
    expect(search.delete('user-1', LATER)).toBe(false);
    expect(search.restore(LATER)).toBe(true);
    expect(search.toSnapshot()).toMatchObject({ deletedAt: undefined, deletedBy: undefined });
    expect(search.restore(LATER)).toBe(false);
  });

  it('limits the active searches of a client', () => {
    expect(checkSavedSearchLimit(MAX_SAVED_SEARCHES_PER_CLIENT - 1).isOk()).toBe(true);
    expect(unwrapErr(checkSavedSearchLimit(MAX_SAVED_SEARCHES_PER_CLIENT))).toEqual({
      type: 'SavedSearchLimitReached',
      max: MAX_SAVED_SEARCHES_PER_CLIENT,
    });
  });
});
