import type { IdGenerator } from '../../shared';
import type { FileStorage } from './ports/file-storage';

/**
 * Sube una imagen de la configuración (logo, logo de la marca de agua) con una clave nueva y
 * corre `work`. Si `work` devuelve un error o lanza, borra la imagen subida.
 *
 * Las imágenes reemplazadas no se borran: el historial de cambios las sigue referenciando.
 */
export async function withStoredImage<T extends { readonly ok: boolean }>(
  deps: { readonly storage: FileStorage; readonly ids: IdGenerator },
  image: { readonly contentType: string; readonly bytes: Uint8Array },
  folder: 'logo' | 'watermark',
  work: (key: string) => Promise<T>,
): Promise<T> {
  const key = `settings/${folder}/${deps.ids.next()}`;
  await deps.storage.put({ key, contentType: image.contentType, bytes: image.bytes });
  let result: T;
  try {
    result = await work(key);
  } catch (error) {
    await deps.storage.delete(key);
    throw error;
  }
  if (!result.ok) await deps.storage.delete(key);
  return result;
}
