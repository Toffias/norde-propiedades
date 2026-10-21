import type { FileStorage } from '../../settings';
import type { PropertyCover } from '../contracts';

import { PHOTO_URL_SECONDS } from './media-support';
import type { ListedCover } from './ports/panel-property-list-query';

/**
 * La portada para la pantalla, sin la clave del storage. Con `storage`, con la miniatura ya
 * firmada: la grilla la carga directo del bucket, sin un pedido al panel por foto. El disco local
 * no firma: la pantalla usa la ruta de fotos del panel.
 */
export async function toCover(
  cover: ListedCover | undefined,
  storage?: FileStorage,
): Promise<PropertyCover | undefined> {
  if (cover === undefined) return undefined;
  const { fileKey, ...rest } = cover;
  if (storage === undefined || fileKey === undefined) return rest;
  const url = await storage.signedUrl(fileKey, {
    expiresInSeconds: PHOTO_URL_SECONDS,
    reusable: true,
  });
  return url === undefined ? rest : { ...rest, url };
}
