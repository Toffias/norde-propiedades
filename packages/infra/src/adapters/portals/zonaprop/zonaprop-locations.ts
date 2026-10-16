import { err, ok, type Result } from '@norde/core/shared';
import { z } from 'zod';

import type { ZonapropApi, ZonapropApiError } from './zonaprop-api';

const LocationsSchema = z.array(
  z.object({
    id: z.string().min(1),
    nombre: z.string().nullish(),
  }),
);

/** Zonaprop no encontró una ubicación para esas coordenadas. */
export interface ZonapropLocationNotFound {
  readonly type: 'location_not_found';
}

/** Coordenadas con 5 decimales (≈ 1 m): dos lecturas de la misma propiedad usan la misma clave. */
function keyOf(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

const CACHE_LIMIT = 500;

/**
 * El `idUbicacion` de Zonaprop para unas coordenadas: `GET /v1/ubicaciones/latitud/…/longitud/…`
 * devuelve la ubicación de país a subbarrio, y se usa la más precisa. Guarda las últimas en memoria:
 * una propiedad se sincroniza muchas veces sin moverse.
 */
export class ZonapropLocations {
  readonly #cache = new Map<string, string>();

  constructor(private readonly deps: { readonly api: ZonapropApi }) {}

  async resolve(coordinates: {
    readonly latitude: number;
    readonly longitude: number;
  }): Promise<Result<string, ZonapropApiError | ZonapropLocationNotFound>> {
    const key = keyOf(coordinates.latitude, coordinates.longitude);
    const cached = this.#cache.get(key);
    if (cached !== undefined) return ok(cached);

    const [latitude, longitude] = key.split(',');
    const result = await this.deps.api.get(
      `/v1/ubicaciones/latitud/${latitude ?? ''}/longitud/${longitude ?? ''}/countrycode/AR`,
      LocationsSchema,
    );
    if (result.isErr()) {
      return err(result.error.type === 'not_found' ? { type: 'location_not_found' } : result.error);
    }
    // De país a subbarrio: la última es la más precisa.
    const id = result.value?.at(-1)?.id;
    if (id === undefined) return err({ type: 'location_not_found' });

    if (this.#cache.size >= CACHE_LIMIT) {
      const oldest = this.#cache.keys().next().value;
      if (oldest !== undefined) this.#cache.delete(oldest);
    }
    this.#cache.set(key, id);
    return ok(id);
  }
}
