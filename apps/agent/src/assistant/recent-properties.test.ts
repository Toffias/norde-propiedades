import { describe, expect, it } from 'vitest';

import {
  MAX_RECENT_PROPERTIES,
  mergeRecentProperties,
  parseRecentProperties,
  type RecentProperty,
} from './recent-properties';
import type { ShownProperty } from './turn-context';

const recent = (id: string): RecentProperty => ({
  id,
  title: `Propiedad ${id}`,
  url: `https://norde.com.ar/propiedades/${id}`,
});

const shown = (id: string): ShownProperty => ({
  ...recent(id),
  photoUrl: null,
  operation: 'Venta',
  price: 'USD 100.000',
  location: 'Palermo, CABA',
  rooms: 2,
  bedrooms: 1,
  surfaceM2: 40,
});

describe('mergeRecentProperties', () => {
  it('puts this turn first, in the shown order, without repeating earlier ones', () => {
    const merged = mergeRecentProperties(
      [recent('a'), recent('b')],
      [shown('c'), shown('a'), shown('d')],
    );

    expect(merged.map((property) => property.id)).toEqual(['c', 'a', 'd', 'b']);
    expect(merged[0]).toEqual(recent('c'));
  });

  it('keeps only the most recent ones', () => {
    const previous = Array.from({ length: MAX_RECENT_PROPERTIES }, (_, i) => recent(`old-${i}`));

    const merged = mergeRecentProperties(previous, [shown('new')]);

    expect(merged).toHaveLength(MAX_RECENT_PROPERTIES);
    expect(merged[0]?.id).toBe('new');
    expect(merged.at(-1)?.id).toBe(`old-${MAX_RECENT_PROPERTIES - 2}`);
  });
});

describe('parseRecentProperties', () => {
  it('reads what the conversation stored', () => {
    expect(parseRecentProperties([recent('a')])).toEqual([recent('a')]);
  });

  it('starts with none when nothing or something invalid was stored', () => {
    expect(parseRecentProperties(undefined)).toEqual([]);
    expect(parseRecentProperties([{ id: 1 }])).toEqual([]);
  });
});
