import type { Result } from '../../../shared';
import type { Watermark } from '../../domain/watermark';

export interface InvalidImageError {
  readonly type: 'InvalidImage';
}

/**
 * Aplica la marca de agua sobre una foto y devuelve una copia (JPEG); el original no se toca.
 * Lo usan las variantes para portales y PDF, y la vista previa de la configuración.
 */
export interface ImageWatermarker {
  apply(input: {
    readonly photo: Uint8Array;
    readonly logo: Uint8Array;
    readonly watermark: Watermark;
  }): Promise<Result<Uint8Array, InvalidImageError>>;
}
