import { describe, expect, it } from 'vitest';

import { tourFor, type Tour } from './tour';

const step = { title: 'Paso', description: 'Qué hace' };
const home: Tour = { paths: ['/'], steps: [step] };
const list: Tour = { paths: ['/propiedades'], steps: [step] };
const detail: Tour = { paths: ['/propiedades/:id'], steps: [step] };
const tours = [home, list, detail];

const ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';

describe('tourFor', () => {
  it('finds the tour of an exact path', () => {
    expect(tourFor('/', tours)).toBe(home);
    expect(tourFor('/propiedades', tours)).toBe(list);
  });

  it('ignores a trailing slash', () => {
    expect(tourFor('/propiedades/', tours)).toBe(list);
  });

  it('matches an entity id', () => {
    expect(tourFor(`/propiedades/${ID}`, tours)).toBe(detail);
  });

  it('does not take a static subpage for an id', () => {
    expect(tourFor('/propiedades/importaciones', tours)).toBeUndefined();
    expect(tourFor(`/propiedades/${ID}/vista-previa`, tours)).toBeUndefined();
  });

  it('has no tour for a screen without one', () => {
    expect(tourFor('/mi-empresa/usuarios', tours)).toBeUndefined();
  });
});
