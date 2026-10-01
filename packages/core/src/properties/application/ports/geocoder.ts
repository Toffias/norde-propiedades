import type { Result } from '../../../shared';

/** Dirección a ubicar en el mapa. La calle y la altura son privadas: no salen del sistema más que acá. */
export interface GeocodingRequest {
  readonly street: string;
  readonly streetNumber: string | undefined;
  readonly neighborhood: string;
  readonly city: string;
  readonly province: string;
}

export interface GeocodingFailedError {
  readonly type: 'GeocodingFailed';
}

/** Convierte una dirección en coordenadas (Nominatim de OpenStreetMap, ADR 0019). */
export interface Geocoder {
  /** `undefined`: el proveedor respondió, pero no encontró la dirección. */
  locate(
    request: GeocodingRequest,
  ): Promise<
    Result<
      { readonly latitude: number; readonly longitude: number } | undefined,
      GeocodingFailedError
    >
  >;
}
