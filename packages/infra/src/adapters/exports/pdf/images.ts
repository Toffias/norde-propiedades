import sharp from 'sharp';

// Las fotos y el logo, listos para el PDF: en JPEG o PNG (react-pdf no lee WebP ni HEIC) y del
// tamaño en que se imprimen, para que el PDF no cargue originales enormes.

const PX_PER_POINT = 2.4;
const MAX_SIDE = 1600;

function toBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * La foto enderezada según el EXIF, en JPEG. Con `cover`, recortada al centro de interés para
 * llenar ese recuadro (en puntos); si no, achicada entera. `undefined` si sharp no puede leerla
 * (WebP, HEIC y PNG se convierten; un archivo que no es una imagen se omite).
 */
export async function photoJpeg(
  bytes: Uint8Array,
  cover?: { readonly width: number; readonly height: number },
): Promise<Uint8Array | undefined> {
  try {
    const image = sharp(toBuffer(bytes)).rotate();
    const resized = cover
      ? image.resize({
          width: Math.min(MAX_SIDE, Math.round(cover.width * PX_PER_POINT)),
          height: Math.min(MAX_SIDE, Math.round(cover.height * PX_PER_POINT)),
          fit: 'cover',
          position: sharp.strategy.attention,
        })
      : image.resize({
          width: MAX_SIDE,
          height: MAX_SIDE,
          fit: 'inside',
          withoutEnlargement: true,
        });
    const jpeg = await resized
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    return new Uint8Array(jpeg);
  } catch {
    // sharp lanza ante bytes que no son una imagen soportada: es un dato inválido, no un fallo.
    return undefined;
  }
}

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
