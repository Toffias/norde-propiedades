import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { AppraisalId } from './appraisal';

export type AppraisalPhotoId = Id<'AppraisalPhoto'>;

/** Tipos de imagen que se aceptan: los mismos que en la galería de una propiedad. */
export const APPRAISAL_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Una foto de celular pesa entre 3 y 8 MB. */
export const MAX_APPRAISAL_PHOTO_BYTES = 15 * 1024 * 1024;
/** Alcanzan para mostrar la propiedad y armar el informe; la galería completa se arma después. */
export const MAX_APPRAISAL_PHOTOS = 30;

/** Foto tomada en la visita. Se guarda la original; al convertir, pasa a la propiedad. */
export interface AppraisalPhoto {
  readonly id: AppraisalPhotoId;
  readonly appraisalId: AppraisalId;
  readonly storageKey: string;
  /** Orden de carga: la primera es la portada de la propiedad al convertir. */
  readonly position: number;
  readonly createdAt: Date;
}

export interface UnsupportedPhotoTypeError {
  readonly type: 'UnsupportedPhotoType';
}
export interface PhotoTooLargeError {
  readonly type: 'PhotoTooLarge';
  readonly maxBytes: number;
}
export interface TooManyPhotosError {
  readonly type: 'TooManyPhotos';
  readonly max: number;
}

/** Valida tipo y tamaño antes de subir la foto al storage. */
export function validateAppraisalPhoto(file: {
  readonly contentType: string;
  readonly sizeBytes: number;
}): Result<void, UnsupportedPhotoTypeError | PhotoTooLargeError> {
  if (!APPRAISAL_PHOTO_TYPES.some((type) => type === file.contentType)) {
    return err({ type: 'UnsupportedPhotoType' });
  }
  if (file.sizeBytes > MAX_APPRAISAL_PHOTO_BYTES) {
    return err({ type: 'PhotoTooLarge', maxBytes: MAX_APPRAISAL_PHOTO_BYTES });
  }
  return ok(undefined);
}

/** ¿Entra una foto más? */
export function checkPhotoRoom(count: number): Result<void, TooManyPhotosError> {
  return count >= MAX_APPRAISAL_PHOTOS
    ? err({ type: 'TooManyPhotos', max: MAX_APPRAISAL_PHOTOS })
    : ok(undefined);
}

/** Dónde se guarda la original en el storage privado. */
export function appraisalPhotoKey(appraisalId: string, photoId: string): string {
  return `appraisals/${appraisalId}/photos/${photoId}/original`;
}
