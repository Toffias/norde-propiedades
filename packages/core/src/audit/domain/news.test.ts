import { describe, expect, it } from 'vitest';

import { NEWS_ACTION_KINDS, NEWS_ACTIONS, newsKindOf } from './news';

const sale = (priceCents: bigint | null, currency = 'USD') => ({
  operation: 'sale',
  currency,
  priceCents,
});
const rent = (priceCents: bigint | null) => ({ operation: 'rent', currency: 'ARS', priceCents });

const edit = (before: unknown, after: unknown) =>
  newsKindOf('property.updated', { operations: { before, after } });

describe('newsKindOf', () => {
  it('maps the actions that are news by themselves', () => {
    expect(newsKindOf('client.registered', {})).toBe('client.created');
    expect(newsKindOf('client.reassigned', {})).toBe('client.reassigned');
    expect(newsKindOf('property.created_from_appraisal', {})).toBe('property.created');
    expect(newsKindOf('property.reservation_signed', {})).toBe('property.reservation');
  });

  it('ignores actions that are not news', () => {
    expect(newsKindOf('property.media_added', {})).toBeUndefined();
    expect(newsKindOf('client.note_added', {})).toBeUndefined();
    expect(newsKindOf('property.reservation_updated', {})).toBeUndefined();
  });

  it('ignores property edits that do not touch the operations', () => {
    expect(newsKindOf('property.updated', { title: { before: 'A', after: 'B' } })).toBeUndefined();
  });

  it('is a price change when a price goes up or down', () => {
    expect(edit([sale(12_000_000n)], [sale(12_800_000n)])).toBe('property.price_changed');
    expect(
      edit([sale(12_000_000n), rent(50_000_000n)], [rent(50_000_000n), sale(11_000_000n)]),
    ).toBe('property.price_changed');
  });

  it('is a price change when a price is loaded, removed or changes currency', () => {
    expect(edit([sale(null)], [sale(12_000_000n)])).toBe('property.price_changed');
    expect(edit([sale(12_000_000n)], [sale(null)])).toBe('property.price_changed');
    expect(edit([sale(12_000_000n)], [sale(12_000_000n, 'ARS')])).toBe('property.price_changed');
  });

  it('is an operation change when the set of operations changes, even with a new price', () => {
    expect(edit([sale(12_000_000n)], [sale(12_000_000n), rent(50_000_000n)])).toBe(
      'property.operation_changed',
    );
    expect(edit([sale(12_000_000n), rent(50_000_000n)], [sale(11_000_000n)])).toBe(
      'property.operation_changed',
    );
  });

  it('is not news when only the commission or "price on request" changed', () => {
    expect(
      edit(
        [{ ...sale(12_000_000n), commissionPct: 3, priceOnRequest: false }],
        [{ ...sale(12_000_000n), commissionPct: 4, priceOnRequest: true }],
      ),
    ).toBeUndefined();
  });

  it('is not news when the operations diff is not a pair of lists', () => {
    expect(edit(null, [sale(12_000_000n)])).toBeUndefined();
  });
});

describe('NEWS_ACTIONS', () => {
  it('covers every action that is news plus the property edit', () => {
    expect(NEWS_ACTIONS).toEqual([...Object.keys(NEWS_ACTION_KINDS), 'property.updated']);
  });
});
