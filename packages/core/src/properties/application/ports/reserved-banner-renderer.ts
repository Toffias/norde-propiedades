import type { Result } from '../../../shared';

import type { InvalidImageError } from './image-variant-generator';

/**
 * Pone el banner "Reservado" sobre una portada y devuelve una copia (JPEG); la portada no se toca.
 * Sin `banner`, usa el de fábrica (franja roja con "RESERVADO"). La ubicación sale del dominio
 * (`reservedBannerPlacement`).
 */
export interface ReservedBannerRenderer {
  render(input: {
    readonly photo: Uint8Array;
    readonly banner: Uint8Array | undefined;
  }): Promise<Result<Uint8Array, InvalidImageError>>;
}
