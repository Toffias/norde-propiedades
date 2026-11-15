import type { PropertyStatus } from './property-status';

/** Ancho del banner "Reservado", en porcentaje del ancho de la portada. */
const BANNER_WIDTH_PERCENT = 65;
/** Alto máximo del banner, en porcentaje del alto de la portada (un banner muy alto tapa la foto). */
const BANNER_MAX_HEIGHT_PERCENT = 30;
/** Distancia entre el borde de arriba de la portada y el banner, en porcentaje del alto. */
const BANNER_TOP_PERCENT = 20;

export interface ReservedBannerPlacement {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Una reservada se sigue mostrando en la web, con su portada "Reservado". */
export function showsReservedCover(status: PropertyStatus): boolean {
  return status === 'reserved';
}

/**
 * Dónde va el banner "Reservado" sobre la portada, en píxeles: pegado al borde izquierdo, a un
 * quinto del alto desde arriba, con el 65 % del ancho de la foto (sin pasar el 30 % del alto) y
 * sus proporciones.
 */
export function reservedBannerPlacement(
  photo: { readonly width: number; readonly height: number },
  banner: { readonly width: number; readonly height: number },
): ReservedBannerPlacement {
  const maxWidth = Math.max(1, Math.round((photo.width * BANNER_WIDTH_PERCENT) / 100));
  const maxHeight = Math.max(1, Math.round((photo.height * BANNER_MAX_HEIGHT_PERCENT) / 100));
  const scale = Math.min(maxWidth / banner.width, maxHeight / banner.height);
  const width = Math.max(1, Math.round(banner.width * scale));
  const height = Math.max(1, Math.round(banner.height * scale));
  const top = Math.min(
    Math.round((photo.height * BANNER_TOP_PERCENT) / 100),
    Math.max(0, photo.height - height),
  );
  return { left: 0, top, width, height };
}
