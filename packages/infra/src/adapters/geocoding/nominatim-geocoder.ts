import type { Geocoder, GeocodingFailedError, GeocodingRequest } from '@norde/core/properties';
import { err, ok, type Result } from '@norde/core/shared';
import { z } from 'zod';

import type { InfraLogger } from '../../shared/logger';

const SearchResponseSchema = z.array(z.object({ lat: z.coerce.number(), lon: z.coerce.number() }));

export interface NominatimGeocoderOptions {
  /**
   * Nombre de la app y un contacto (`NordePropiedades/1.0 (sistemas@norde.com.ar)`): la política
   * de uso de Nominatim lo exige en cada pedido.
   */
  readonly userAgent: string;
  readonly logger: InfraLogger;
  /** Otra instancia de Nominatim (propia o de un proveedor), si el volumen lo pide. */
  readonly baseUrl?: string | undefined;
  readonly fetch?: typeof fetch;
}

/**
 * Geocodificación con Nominatim (OpenStreetMap, ADR 0019). Se usa al dar de alta una propiedad sin
 * coordenadas: un pedido por alta, muy por debajo del límite de uso (un pedido por segundo). La
 * dirección es privada: no se loguea.
 */
export class NominatimGeocoder implements Geocoder {
  readonly #fetch: typeof fetch;
  readonly #endpoint: string;

  constructor(private readonly options: NominatimGeocoderOptions) {
    this.#fetch = options.fetch ?? fetch;
    this.#endpoint = `${options.baseUrl ?? 'https://nominatim.openstreetmap.org'}/search`;
  }

  async locate(
    request: GeocodingRequest,
  ): Promise<
    Result<
      { readonly latitude: number; readonly longitude: number } | undefined,
      GeocodingFailedError
    >
  > {
    const street = [request.street, request.streetNumber ?? ''].join(' ');
    const query = [street, request.neighborhood, request.city, request.province, 'Argentina']
      .map((part) => part.trim())
      .filter((part) => part !== '')
      .join(', ');
    const url = new URL(this.#endpoint);
    url.search = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '1',
      countrycodes: 'ar',
    }).toString();

    let response: Response;
    try {
      response = await this.#fetch(url, {
        headers: { 'User-Agent': this.options.userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
      });
    } catch (error) {
      this.options.logger.warn({ err: error }, 'Nominatim unreachable');
      return err({ type: 'GeocodingFailed' });
    }
    if (!response.ok) {
      this.options.logger.warn({ status: response.status }, 'Nominatim rejected the search');
      return err({ type: 'GeocodingFailed' });
    }

    const parsed = SearchResponseSchema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) {
      this.options.logger.warn({}, 'Unexpected Nominatim response');
      return err({ type: 'GeocodingFailed' });
    }
    const [first] = parsed.data;
    return ok(first === undefined ? undefined : { latitude: first.lat, longitude: first.lon });
  }
}
