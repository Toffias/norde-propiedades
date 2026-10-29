import sharp from 'sharp';

// Las imágenes que no son fotos de la propiedad, listas para el PDF.

/**
 * El logo de Mi empresa listo para la cabecera: en PNG (react-pdf no lee WebP), sin el margen
 * vacío que suele traer (un logo cuadrado con fondo blanco se vería chico) y del tamaño de la
 * cabecera.
 * `undefined` si no es una imagen: la cabecera lleva el nombre de la empresa.
 */
export async function logoPng(bytes: Uint8Array | undefined): Promise<Uint8Array | undefined> {
  if (bytes === undefined) return undefined;
  try {
    const png = await sharp(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))
      .trim({ threshold: 12 })
      // La ficha lo muestra de 30 × 160 puntos y la vidriera hasta 44 × 200: a 2,4 px por punto.
      .resize({ width: 480, height: 106, fit: 'inside', withoutEnlargement: true })
      .png({ palette: true })
      .toBuffer();
    return new Uint8Array(png);
  } catch {
    // Un logo que no es una imagen: la cabecera lleva el nombre de la empresa.
    return undefined;
  }
}
