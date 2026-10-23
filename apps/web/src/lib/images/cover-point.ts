/** Un punto en proporción del ancho y del alto (0 a 1). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * Punto de la foto (en proporción de la imagen original) en píxeles del elemento, con
 * `object-fit: cover` y su `object-position`.
 */
export function coverPoint(
  box: Size,
  natural: Size,
  position: Point,
  target: Point,
): { readonly x: number; readonly y: number } {
  const scale = Math.max(box.width / natural.width, box.height / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  return {
    x: (box.width - width) * position.x + target.x * width,
    y: (box.height - height) * position.y + target.y * height,
  };
}
