import type { Result } from '../../../shared';
import type { MediaRotation } from '../../domain/media-item';

export interface InvalidImageError {
  readonly type: 'InvalidImage';
}

export interface ImageVariants {
  /** Unos 400 px de ancho, para la galería y las tarjetas. */
  readonly thumbnail: Uint8Array;
  /** Unos 1600 px de ancho, para la web, los portales y el PDF. */
  readonly web: Uint8Array;
  /** Medidas de la original, ya rotada. */
  readonly width: number;
  readonly height: number;
}

/** Genera las versiones optimizadas (JPEG) de una foto, aplicando la rotación elegida. */
export interface ImageVariantGenerator {
  generate(input: {
    readonly original: Uint8Array;
    readonly rotation: MediaRotation;
  }): Promise<Result<ImageVariants, InvalidImageError>>;
}
