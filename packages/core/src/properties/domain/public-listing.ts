// Qué ve el público (web y agente de IA) de una propiedad publicada.

import type { MediaKind, MediaProcessingStatus, MediaVariants } from './media-item';
import { PROPERTY_OPERATIONS, type PropertyOperationKind } from './property-catalog';

export interface PublicPriceSource {
  readonly priceCents: bigint | null;
  readonly priceOnRequest: boolean;
}

/**
 * Precio que se muestra de una operación, o `null` ("Consultar precio"): sin precio cargado,
 * con "precio a consultar" o con "Mostrar precio en la web" apagado en la propiedad.
 */
export function publicPrice(operation: PublicPriceSource, showPriceOnWeb: boolean): bigint | null {
  if (!showPriceOnWeb || operation.priceOnRequest) return null;
  return operation.priceCents;
}

/**
 * La operación que encabeza la ficha o la tarjeta: la que se buscó, si la propiedad la ofrece;
 * si no, la primera en el orden del catálogo (venta, alquiler, temporario).
 */
export function primaryOperation<T extends { readonly operation: PropertyOperationKind }>(
  operations: readonly T[],
  preferred?: PropertyOperationKind,
): T | undefined {
  const byKind = (kind: PropertyOperationKind) => operations.find((o) => o.operation === kind);
  const searched = preferred === undefined ? undefined : byKind(preferred);
  if (searched) return searched;
  for (const kind of PROPERTY_OPERATIONS) {
    const found = byKind(kind);
    if (found) return found;
  }
  return undefined;
}

export interface PublicAddressSource {
  /** Calle y altura ("Gurruchaga 1834"); piso y unidad nunca se publican. */
  readonly address: string | null;
  readonly showExactAddress: boolean;
  /** Dirección aproximada que carga el equipo ("Gurruchaga al 1800"). */
  readonly publishAddress: string | null;
}

/**
 * Dirección que se publica: la exacta si el equipo lo habilitó en la propiedad; si no, la
 * aproximada; si tampoco hay, ninguna (la ficha muestra solo el barrio).
 */
export function publicAddress(property: PublicAddressSource): string | null {
  const exact = property.showExactAddress ? clean(property.address) : null;
  return exact ?? clean(property.publishAddress);
}

function clean(text: string | null): string | null {
  const trimmed = text?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/** Decimales de las coordenadas aproximadas: unos 100 m, la manzana sin el frente exacto. */
const APPROXIMATE_DECIMALS = 3;

export interface PublicCoordinates {
  readonly latitude: number;
  readonly longitude: number;
  /** `false`: el mapa muestra una zona, no un pin en la puerta. */
  readonly exact: boolean;
}

/** El pin exacto solo si se muestra la dirección exacta; si no, redondeado a la manzana. */
export function publicCoordinates(property: {
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly showExactAddress: boolean;
}): PublicCoordinates | null {
  const { latitude, longitude, showExactAddress } = property;
  if (latitude === null || longitude === null) return null;
  if (showExactAddress) return { latitude, longitude, exact: true };
  const factor = 10 ** APPROXIMATE_DECIMALS;
  return {
    latitude: Math.round(latitude * factor) / factor,
    longitude: Math.round(longitude * factor) / factor,
    exact: false,
  };
}

export interface PublicMediaSource {
  readonly kind: MediaKind;
  readonly storageKey: string | null;
  /** Link externo: videos, recorridos 360 y fotos importadas sin archivo propio. */
  readonly externalUrl: string | null;
  readonly showOnWeb: boolean;
  readonly processing: MediaProcessingStatus;
  readonly variants: MediaVariants;
}

/**
 * Clave del storage que se publica de una foto o un plano: con marca de agua si Mi empresa la
 * activó, si no la versión web. La original nunca se publica (pesa varios MB y no lleva marca).
 */
export function publicImageKey(media: PublicMediaSource): string | undefined {
  if (media.kind !== 'photo' && media.kind !== 'floor_plan') return undefined;
  if (!media.showOnWeb || media.processing !== 'ready') return undefined;
  return media.variants.watermarked ?? media.variants.web;
}

/**
 * Una foto o un plano se publica si el equipo no lo ocultó y ya tiene su versión web. Las fotos
 * importadas sin archivo propio se publican con su link externo.
 */
export function isPublicImage(media: PublicMediaSource): boolean {
  if (media.kind !== 'photo' && media.kind !== 'floor_plan') return false;
  if (media.storageKey === null) return media.showOnWeb && isHttps(media.externalUrl);
  return publicImageKey(media) !== undefined;
}

/** Videos y recorridos 360 se publican si el equipo no los ocultó. */
export function isPublicLink(media: PublicMediaSource): boolean {
  return (
    (media.kind === 'video' || media.kind === 'tour_360') &&
    media.showOnWeb &&
    isHttps(media.externalUrl)
  );
}

function isHttps(url: string | null): url is string {
  return url?.startsWith('https://') ?? false;
}
