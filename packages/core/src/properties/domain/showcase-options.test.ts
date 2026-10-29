import { describe, expect, it } from 'vitest';

import { DEFAULT_SHOWCASE_OPTIONS, showcaseOptions, showcasePhotos } from './showcase-options';

describe('showcaseOptions', () => {
  it('acepta las opciones por defecto', () => {
    const result = showcaseOptions(DEFAULT_SHOWCASE_OPTIONS);
    expect(result.isOk() && result.value).toEqual(DEFAULT_SHOWCASE_OPTIONS);
  });

  it('guarda los colores en minúscula', () => {
    const result = showcaseOptions({
      ...DEFAULT_SHOWCASE_OPTIONS,
      primaryColor: '#C9302B',
      secondaryColor: '#00AAFF',
    });
    expect(result.isOk() && [result.value.primaryColor, result.value.secondaryColor]).toEqual([
      '#c9302b',
      '#00aaff',
    ]);
  });

  it.each([
    ['primaryColor', { primaryColor: 'red' }],
    ['secondaryColor', { secondaryColor: '#abc' }],
    ['descriptionSize', { descriptionSize: 29 }],
    ['descriptionSize', { descriptionSize: 51 }],
    ['descriptionSize', { descriptionSize: 40.5 }],
    ['photoIds', { photoCount: 1 as const, photoIds: ['a', 'b'] }],
    ['photoIds', { photoIds: ['a', 'a'] }],
  ])('rechaza %s inválido', (field, change) => {
    const result = showcaseOptions({ ...DEFAULT_SHOWCASE_OPTIONS, ...change });
    expect(result.isErr() && result.error).toEqual({ type: 'InvalidShowcaseOptions', field });
  });
});

describe('showcasePhotos', () => {
  const photos = ['a', 'b', 'c', 'd'].map((id) => ({ id }));

  it('sin elegir, toma las primeras en el orden de la ficha', () => {
    expect(showcasePhotos(photos, { photoCount: 3, photoIds: [] })).toEqual([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ]);
  });

  it('pone primero las elegidas, en su orden, y completa con las demás', () => {
    expect(showcasePhotos(photos, { photoCount: 3, photoIds: ['d', 'b'] })).toEqual([
      { id: 'd' },
      { id: 'b' },
      { id: 'a' },
    ]);
  });

  it('saltea las elegidas que ya no están', () => {
    expect(showcasePhotos(photos, { photoCount: 1, photoIds: ['z'] })).toEqual([{ id: 'a' }]);
  });
});
