import { describe, expect, it } from 'vitest';

import { MAX_FAVORITES, parseFavorites, toggleFavorite, type Favorite } from './favorites';

function favorite(n: number): Favorite {
  return {
    id: `00000000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`,
    href: `/propiedades/casa-${n}`,
    title: `Casa ${n}`,
    priceLabel: 'USD 120.000',
    location: 'Mataderos, CABA',
    cover: null,
  };
}

describe('parseFavorites', () => {
  it('returns nothing for missing, broken or non-list values', () => {
    expect(parseFavorites(null)).toEqual([]);
    expect(parseFavorites('{not json')).toEqual([]);
    expect(parseFavorites('{"id":"x"}')).toEqual([]);
  });

  it('drops invalid entries and duplicates', () => {
    const raw = JSON.stringify([
      favorite(1),
      { ...favorite(2), href: 'https://otro-sitio.com' },
      favorite(1),
      { id: 'no-uuid' },
      favorite(3),
    ]);
    expect(parseFavorites(raw).map((item) => item.title)).toEqual(['Casa 1', 'Casa 3']);
  });

  it('keeps at most the maximum', () => {
    const raw = JSON.stringify(
      Array.from({ length: MAX_FAVORITES + 5 }, (_, i) => favorite(i + 1)),
    );
    expect(parseFavorites(raw)).toHaveLength(MAX_FAVORITES);
  });
});

describe('toggleFavorite', () => {
  it('adds a new favorite first and removes an existing one', () => {
    const added = toggleFavorite([favorite(1)], favorite(2));
    expect(added.map((item) => item.title)).toEqual(['Casa 2', 'Casa 1']);
    expect(toggleFavorite(added, favorite(1)).map((item) => item.title)).toEqual(['Casa 2']);
  });

  it('does not add when the list is full, but still removes', () => {
    const full = Array.from({ length: MAX_FAVORITES }, (_, i) => favorite(i + 1));
    expect(toggleFavorite(full, favorite(99))).toBe(full);
    expect(toggleFavorite(full, favorite(1))).toHaveLength(MAX_FAVORITES - 1);
  });
});
