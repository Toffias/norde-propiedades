import {
  publicImagePath,
  publicImageVersion,
  type MoneyDto,
  type Operation,
  type PropertyDetail,
  type PropertySummary,
  type PublicImage,
  type PublicOperation,
} from '../contracts';
import {
  isPublicImage,
  isPublicLink,
  primaryOperation,
  publicAddress,
  publicCoordinates,
  publicPrice,
} from '../domain/public-listing';

import type {
  PropertyMediaRecord,
  PropertyOperationRecord,
  PropertyRecord,
} from './ports/property-search-query';

function toPublicOperation(
  operation: PropertyOperationRecord,
  showPriceOnWeb: boolean,
): PublicOperation {
  const cents = publicPrice(operation, showPriceOnWeb);
  return {
    operation: operation.operation,
    price: cents === null ? null : { amountCents: cents, currency: operation.currency },
  };
}

function toPublicImage(media: PropertyMediaRecord): PublicImage {
  const version = publicImageVersion(media.updatedAt);
  return {
    id: media.id,
    src:
      media.storageKey === null && media.externalUrl !== null
        ? media.externalUrl
        : publicImagePath(media.id, version),
    width: media.width,
    height: media.height,
    description: media.description,
  };
}

/** Las fotos o los planos que se publican, en el orden de la galería. */
export function publicImages(
  media: readonly PropertyMediaRecord[],
  kind: 'photo' | 'floor_plan',
): PublicImage[] {
  return media.filter((m) => m.kind === kind && isPublicImage(m)).map(toPublicImage);
}

/** Los links de videos o recorridos 360 que se publican. */
export function publicLinkUrls(
  media: readonly PropertyMediaRecord[],
  kind: 'video' | 'tour_360',
): string[] {
  return media.flatMap((m) =>
    m.kind === kind && isPublicLink(m) && m.externalUrl !== null ? [m.externalUrl] : [],
  );
}

/**
 * Tarjeta pública. `undefined` si la propiedad no tiene operaciones: no se ofrece (la búsqueda
 * ya las deja afuera).
 */
export function toPropertySummary(
  record: PropertyRecord,
  searched?: Operation,
): PropertySummary | undefined {
  const operations = record.operations.map((o) => toPublicOperation(o, record.showPriceOnWeb));
  const primary = primaryOperation(operations, searched);
  if (!primary) return undefined;
  const photos = publicImages(record.media, 'photo');
  // Las expensas se pagan siempre en pesos.
  const expenses: MoneyDto | null =
    record.expensesCents === null ? null : { amountCents: record.expensesCents, currency: 'ARS' };
  return {
    id: record.id,
    code: record.code,
    slug: record.slug,
    title: record.title,
    operation: primary.operation,
    price: primary.price,
    operations,
    propertyType: record.propertyType,
    featured: record.featured,
    expenses,
    rooms: record.rooms,
    bedrooms: record.bedrooms,
    bathrooms: record.bathrooms,
    parkingSpaces: record.parkingSpaces,
    surfaceTotalM2: record.surfaceTotalM2,
    surfaceCoveredM2: record.surfaceCoveredM2,
    address: publicAddress(record),
    neighborhood: record.neighborhood,
    city: record.city,
    amenities: record.features.filter((f) => f.kind === 'amenity').map((f) => f.name),
    cover: photos[0] ?? null,
    photoCount: photos.length,
  };
}

export function toPropertyDetail(record: PropertyRecord): PropertyDetail | undefined {
  const summary = toPropertySummary(record);
  if (!summary) return undefined;
  return {
    ...summary,
    description: record.description,
    province: record.province,
    coordinates: publicCoordinates(record),
    toilets: record.toilets,
    ageYears: record.ageYears,
    condition: record.condition,
    disposition: record.disposition,
    orientation: record.orientation,
    surfaceSemiCoveredM2: record.surfaceSemiCoveredM2,
    surfaceLandM2: record.surfaceLandM2,
    frontM: record.frontM,
    depthM: record.depthM,
    isFurnished: record.isFurnished,
    creditEligible: record.creditEligible,
    professionalUse: record.professionalUse,
    features: record.features,
    photos: publicImages(record.media, 'photo'),
    floorPlans: publicImages(record.media, 'floor_plan'),
    videoUrls: publicLinkUrls(record.media, 'video'),
    tourUrls: publicLinkUrls(record.media, 'tour_360'),
    developmentId: record.developmentId,
    updatedAt: record.updatedAt,
  };
}
