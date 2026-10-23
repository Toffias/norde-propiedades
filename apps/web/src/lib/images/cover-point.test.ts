import { describe, expect, it } from 'vitest';

import { coverPoint } from './cover-point';

// La foto de la fachada es vertical (1500x2000) y el hero, apaisado.
const FACADE = { width: 1500, height: 2000 };
const DOOR = { x: 0.5, y: 0.75 };

describe('coverPoint', () => {
  it('maps a point of a portrait photo cropped vertically by object-position', () => {
    // 1200 de ancho: la foto se escala a 1200x1600 y se recorta en alto (sobran 1000 px).
    const point = coverPoint({ width: 1200, height: 600 }, FACADE, { x: 0.5, y: 0.66 }, DOOR);

    expect(point.x).toBeCloseTo(600);
    expect(point.y).toBeCloseTo(-660 + 1200);
  });

  it('maps a point when the photo is cropped horizontally', () => {
    // 400x800: la foto se escala a 600x800 y sobran 200 px de ancho.
    const point = coverPoint({ width: 400, height: 800 }, FACADE, { x: 0.5, y: 0.5 }, DOOR);

    expect(point.x).toBeCloseTo(-100 + 300);
    expect(point.y).toBeCloseTo(600);
  });
});
