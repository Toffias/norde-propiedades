import { err, ok, type Result } from '../../shared/domain/result';

// Las opciones del PDF de vidriera (#175, etapa 2), las mismas que ofrece Tokko: vertical u
// horizontal, colores, QR a la ficha web, banda con la operación, 1 o 3 fotos y el tamaño de letra
// de la descripción. Se eligen al pedirlo y quedan guardadas con el PDF.

export const SHOWCASE_ORIENTATIONS = ['portrait', 'landscape'] as const;
export type ShowcaseOrientation = (typeof SHOWCASE_ORIENTATIONS)[number];

export const SHOWCASE_PHOTO_COUNTS = [1, 3] as const;
export type ShowcasePhotoCount = (typeof SHOWCASE_PHOTO_COUNTS)[number];

/** El tamaño de letra de la descripción, en la escala de Tokko (30 a 50). */
export const SHOWCASE_DESCRIPTION_SIZE = { min: 30, max: 50 } as const;

export interface ShowcaseOptions {
  readonly orientation: ShowcaseOrientation;
  /** La banda de la operación, el precio y los íconos. `#rrggbb`. */
  readonly primaryColor: string;
  /** La franja de contacto. `#rrggbb`. */
  readonly secondaryColor: string;
  /** El QR a la ficha en la web: solo sale si la propiedad está publicada en la web. */
  readonly qr: boolean;
  readonly operationBand: boolean;
  readonly photoCount: ShowcasePhotoCount;
  /** Las fotos elegidas, en orden. Las que falten hasta `photoCount` se completan solas. */
  readonly photoIds: readonly string[];
  /** Hasta dónde puede crecer la letra: si la descripción no entra, se achica. */
  readonly descriptionSize: number;
}

/** Los colores de la marca, los del sitio público. */
export const DEFAULT_SHOWCASE_OPTIONS: ShowcaseOptions = {
  orientation: 'portrait',
  primaryColor: '#c9302b',
  secondaryColor: '#2a2522',
  qr: true,
  operationBand: true,
  photoCount: 3,
  photoIds: [],
  descriptionSize: 40,
};

export interface InvalidShowcaseOptionsError {
  readonly type: 'InvalidShowcaseOptions';
  readonly field: 'primaryColor' | 'secondaryColor' | 'descriptionSize' | 'photoIds';
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Valida las opciones: colores `#rrggbb` (se guardan en minúscula), la letra entre 30 y 50 y no
 * más fotos elegidas que las que entran, sin repetir.
 */
export function showcaseOptions(
  raw: ShowcaseOptions,
): Result<ShowcaseOptions, InvalidShowcaseOptionsError> {
  if (!HEX_COLOR.test(raw.primaryColor)) {
    return err({ type: 'InvalidShowcaseOptions', field: 'primaryColor' });
  }
  if (!HEX_COLOR.test(raw.secondaryColor)) {
    return err({ type: 'InvalidShowcaseOptions', field: 'secondaryColor' });
  }
  if (
    !Number.isInteger(raw.descriptionSize) ||
    raw.descriptionSize < SHOWCASE_DESCRIPTION_SIZE.min ||
    raw.descriptionSize > SHOWCASE_DESCRIPTION_SIZE.max
  ) {
    return err({ type: 'InvalidShowcaseOptions', field: 'descriptionSize' });
  }
  if (raw.photoIds.length > raw.photoCount || new Set(raw.photoIds).size !== raw.photoIds.length) {
    return err({ type: 'InvalidShowcaseOptions', field: 'photoIds' });
  }
  return ok({
    ...raw,
    primaryColor: raw.primaryColor.toLowerCase(),
    secondaryColor: raw.secondaryColor.toLowerCase(),
  });
}

/**
 * Las fotos de la vidriera: primero las elegidas que sigan disponibles, en el orden elegido, y
 * después las demás en el orden de la ficha, hasta completar la cantidad.
 */
export function showcasePhotos<T extends { readonly id: string }>(
  candidates: readonly T[],
  options: Pick<ShowcaseOptions, 'photoCount' | 'photoIds'>,
): T[] {
  const chosen = options.photoIds.flatMap((id) => candidates.filter((item) => item.id === id));
  const rest = candidates.filter((item) => !options.photoIds.includes(item.id));
  return [...chosen, ...rest].slice(0, options.photoCount);
}
