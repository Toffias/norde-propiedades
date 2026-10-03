import type { MediaOwnerInput } from '@norde/core/properties/contracts';

/** La ficha del dueño: `/propiedades/<id>` o `/emprendimientos/<id>`. */
export function ownerHref(owner: MediaOwnerInput): string {
  return `${owner.kind === 'property' ? '/propiedades' : '/emprendimientos'}/${owner.id}`;
}

/** Una foto de la galería, servida por la ficha del dueño (el storage es privado). */
export function mediaFileHref(owner: MediaOwnerInput, mediaId: string): string {
  return `${ownerHref(owner)}/fotos/${mediaId}`;
}

/** La descarga de un archivo, autorizada por la ficha del dueño. */
export function attachmentFileHref(owner: MediaOwnerInput, attachmentId: string): string {
  return `${ownerHref(owner)}/archivos/${attachmentId}`;
}
