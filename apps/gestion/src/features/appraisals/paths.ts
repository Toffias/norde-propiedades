/** Una foto de la tasación, servida por su ficha (el storage es privado). */
export function appraisalPhotoHref(appraisalId: string, photoId: string): string {
  return `/tasaciones/${appraisalId}/fotos/${photoId}`;
}
