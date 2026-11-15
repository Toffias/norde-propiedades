import type { FileStorage } from '../../settings';
import type { PropertyCover } from '../contracts';

import { PHOTO_URL_SECONDS } from './media-support';
import type { ListedCover } from './ports/panel-property-list-query';
import type { PropertyStatus } from '../domain/property-status';
import { showsReservedCover } from '../domain/reserved-cover';

/**
 * La portada para la pantalla, sin la clave del storage. Con `storage`, con la miniatura ya
 * firmada: la grilla la carga directo del bucket, sin un pedido al panel por foto. El disco local
 * no firma: la pantalla usa la ruta de fotos del panel.
 */
export async function toCover(
  cover: ListedCover | undefined,
  storage?: FileStorage,
  status?: PropertyStatus,
): Promise<PropertyCover | undefined> {
  if (cover === undefined) return undefined;
  const { fileKey: thumbnailKey, reservedKey, ...base } = cover;
  // Reservada, la portada lleva el banner "Reservado" (si ya se generó).
  const reserved = status !== undefined && showsReservedCover(status) && reservedKey !== undefined;
  const rest: PropertyCover = reserved ? { ...base, reserved: true } : base;
  const fileKey = reserved ? reservedKey : thumbnailKey;
  if (storage === undefined || fileKey === undefined) return rest;
  const url = await storage.signedUrl(fileKey, {
    expiresInSeconds: PHOTO_URL_SECONDS,
    reusable: true,
  });
  return url === undefined ? rest : { ...rest, url };
}
