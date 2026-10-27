import { describe, expect, it } from 'vitest';

import {
  followUpDigestText,
  followUpPrice,
  isPriceDrop,
  pickFollowUpDigest,
  type FollowUpMatch,
  type FollowUpMatchId,
  type FollowUpReason,
} from './follow-up-match';
import type { ClientId } from './client';
import type { SavedSearchId } from './saved-search';

describe('isPriceDrop', () => {
  it('is a drop only when both prices are known and the new one is lower', () => {
    expect(isPriceDrop(12_000_000n, 11_500_000n)).toBe(true);
    expect(isPriceDrop(12_000_000n, 12_000_000n)).toBe(false);
    expect(isPriceDrop(12_000_000n, 13_000_000n)).toBe(false);
  });

  it('ignores a change without the previous or the new price', () => {
    expect(isPriceDrop(undefined, 11_500_000n)).toBe(false);
    expect(isPriceDrop(12_000_000n, undefined)).toBe(false);
  });
});

describe('followUpPrice', () => {
  const operations = [
    { operation: 'sale', currency: 'USD', priceCents: 12_000_000n },
    { operation: 'rent', currency: 'ARS', priceCents: undefined },
  ];

  it('takes the price of the matched operation', () => {
    expect(followUpPrice(operations, 'sale')).toEqual({
      operation: 'sale',
      currency: 'USD',
      priceCents: 12_000_000n,
    });
    expect(followUpPrice(operations, 'rent')?.priceCents).toBeUndefined();
    expect(followUpPrice(operations, 'temporary_rent')).toBeUndefined();
  });
});

function aMatch(
  n: number,
  propertyId: string,
  reason: FollowUpReason = 'new_listing',
  detectedAt = `2026-10-2${n.toString()}T12:00:00Z`,
): FollowUpMatch {
  return {
    id: `00000000-0000-7000-8000-00000000000${n.toString()}` as FollowUpMatchId,
    clientId: '00000000-0000-7000-8000-0000000000a1' as ClientId,
    propertyId,
    reason,
    source: {
      kind: 'saved_search',
      savedSearchId: '00000000-0000-7000-8000-0000000000b1' as SavedSearchId,
    },
    price: { operation: 'sale', currency: 'USD', priceCents: 10_000_000n },
    detectedAt: new Date(detectedAt),
  };
}

describe('pickFollowUpDigest', () => {
  it('takes the oldest properties up to the limit, each one once', () => {
    const pending = [
      aMatch(3, 'p3'),
      aMatch(1, 'p1'),
      aMatch(4, 'p1', 'price_drop'),
      aMatch(2, 'p2'),
    ];

    const digest = pickFollowUpDigest(pending, 2);

    expect(digest.propertyIds).toEqual(['p1', 'p2']);
    // La baja de p1 va con su alta: es la misma propiedad.
    expect(digest.matches.map((m) => m.id)).toEqual([
      pending[1]?.id,
      pending[3]?.id,
      pending[2]?.id,
    ]);
  });

  it('is empty without pending matches', () => {
    expect(pickFollowUpDigest([], 20)).toEqual({ matches: [], propertyIds: [] });
  });
});

describe('followUpDigestText', () => {
  it('tells about new listings', () => {
    const text = followUpDigestText({
      companyName: 'Norde',
      firstName: 'Ana',
      matches: [aMatch(1, 'p1'), aMatch(2, 'p2')],
    });

    expect(text.subject).toBe('Norde: 2 propiedades nuevas para vos');
    expect(text.message).toBe(
      '¡Hola, Ana!\nEncontramos 2 propiedades nuevas que coinciden con lo que estás buscando.',
    );
  });

  it('tells about a price drop alone', () => {
    const text = followUpDigestText({
      companyName: 'Norde',
      firstName: undefined,
      matches: [aMatch(1, 'p1', 'price_drop')],
    });

    expect(text.subject).toBe('Norde: bajó de precio una propiedad que te interesa');
    expect(text.message).toBe('¡Hola!\nBajó de precio una propiedad que te puede interesar.');
  });

  it('tells about both, counting each property once', () => {
    const text = followUpDigestText({
      companyName: 'Norde',
      firstName: 'Ana',
      matches: [aMatch(1, 'p1'), aMatch(2, 'p2', 'price_drop'), aMatch(3, 'p2', 'price_drop')],
    });

    expect(text.subject).toBe('Norde: propiedades nuevas y bajas de precio para vos');
    expect(text.message).toBe(
      '¡Hola, Ana!\nEncontramos una propiedad nueva que coincide con lo que estás buscando.\nAdemás, bajó de precio una propiedad que te puede interesar.',
    );
  });
});
