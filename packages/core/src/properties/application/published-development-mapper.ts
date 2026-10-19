import type { DevelopmentSummary, PublishedDevelopmentDetail } from '../contracts';
import { developmentPriceFrom, placeFromPath } from '../domain/public-development';
import { publicCoordinates } from '../domain/public-listing';

import type { PublishedDevelopmentRecord } from './ports/published-development-query';
import { publicImages, publicLinkUrls } from './property-mapper';

function clean(text: string | null): string | null {
  const trimmed = text?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/** Tarjeta pública de un emprendimiento: sin dirección exacta, desarrollista ni contacto. */
export function toDevelopmentSummary(record: PublishedDevelopmentRecord): DevelopmentSummary {
  const place = placeFromPath(record.locationPath);
  const photos = publicImages(record.media, 'photo');
  const priceFrom = developmentPriceFrom(record.unitPricesFrom);
  return {
    id: record.id,
    code: record.code,
    slug: record.slug,
    name: record.name,
    developmentType: record.developmentType,
    constructionStatus: record.constructionStatus,
    deliveryDate: record.deliveryDate,
    address: clean(record.publishAddress),
    neighborhood: place.neighborhood,
    city: place.city,
    availableUnitCount: record.listedUnitCount,
    priceFrom: priceFrom ?? null,
    cover: photos[0] ?? null,
    photoCount: photos.length,
  };
}

export function toPublishedDevelopmentDetail(
  record: PublishedDevelopmentRecord,
): PublishedDevelopmentDetail {
  return {
    ...toDevelopmentSummary(record),
    description: record.description,
    province: placeFromPath(record.locationPath).province,
    // La dirección exacta es privada: el mapa muestra la zona, nunca la puerta.
    coordinates: publicCoordinates({
      latitude: record.latitude,
      longitude: record.longitude,
      showExactAddress: false,
    }),
    isFinanced: record.isFinanced,
    acceptsSwap: record.acceptsSwap,
    immediateDeed: record.immediateDeed,
    financingDetails: clean(record.financingDetails),
    features: record.features,
    photos: publicImages(record.media, 'photo'),
    floorPlans: publicImages(record.media, 'floor_plan'),
    videoUrls: publicLinkUrls(record.media, 'video'),
    tourUrls: publicLinkUrls(record.media, 'tour_360'),
    updatedAt: record.updatedAt,
  };
}
