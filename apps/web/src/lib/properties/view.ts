import type {
  Operation,
  PropertyDetail,
  PropertySummary,
  PublicImage,
  PublicLocation,
  PublicMapPin,
} from '@norde/core/properties/contracts';

import { routes } from '../seo/routes';
import { htmlToText } from '../html-to-text';
import { nonEmpty } from '../strings';
import { formatMoney, formatPrice, formatShortPrice, formatSurface, plural } from './format';
import {
  CONDITION_LABELS,
  DISPOSITION_LABELS,
  FEATURE_KIND_LABELS,
  labelOf,
  OPERATION_LABELS,
  ORIENTATION_LABELS,
  PROPERTY_TYPE_LABELS,
} from './labels';

// Lo que muestran las tarjetas y la ficha, ya formateado y serializable (sin `bigint` ni `Date`):
// así se puede guardar en el caché de Next y pasar a componentes de cliente.

export interface ListingImage {
  readonly src: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly alt: string;
}

export type ListingFactKind = 'surface' | 'rooms' | 'bedrooms' | 'bathrooms' | 'parking';

export interface ListingFact {
  readonly kind: ListingFactKind;
  readonly label: string;
}

export interface ListingCard {
  readonly id: string;
  readonly slug: string;
  readonly href: string;
  readonly title: string;
  readonly operation: Operation;
  readonly operationLabel: string;
  readonly priceLabel: string;
  readonly hasPrice: boolean;
  readonly expensesLabel: string | null;
  readonly propertyTypeLabel: string;
  /** "Mataderos, CABA". */
  readonly location: string;
  readonly address: string | null;
  readonly cover: ListingImage | null;
  readonly photoCount: number;
  readonly featured: boolean;
  readonly facts: readonly ListingFact[];
}

export interface ListingAttribute {
  readonly label: string;
  readonly value: string;
}

export interface ListingDetail extends ListingCard {
  readonly code: string;
  /** El precio publicado como número (unidades), para el JSON-LD. */
  readonly offer: { readonly amount: number; readonly currency: string } | null;
  /** Cubierta, o total si no hay cubierta: para el JSON-LD. */
  readonly surfaceM2: number | null;
  readonly rooms: number | null;
  readonly description: string;
  /** Las otras operaciones que ofrece ("Alquiler: $ 600.000"). */
  readonly otherOperations: readonly ListingAttribute[];
  readonly photos: readonly ListingImage[];
  readonly floorPlans: readonly ListingImage[];
  readonly coordinates: {
    readonly latitude: number;
    readonly longitude: number;
    readonly exact: boolean;
  } | null;
  readonly attributes: readonly ListingAttribute[];
  readonly featureGroups: readonly { readonly label: string; readonly names: readonly string[] }[];
  readonly videoUrls: readonly string[];
  readonly tourUrls: readonly string[];
  readonly province: string;
  readonly propertyType: PropertySummary['propertyType'];
  readonly updatedAt: string;
}

/** Un pin del mapa del listado y su tarjeta. */
export interface MapPinView {
  readonly id: string;
  readonly href: string;
  readonly title: string;
  readonly operationLabel: string;
  /** "USD 150 mil": la etiqueta del pin. */
  readonly shortPrice: string;
  readonly priceLabel: string;
  readonly location: string;
  readonly latitude: number;
  readonly longitude: number;
  /** `false`: aproximado a la manzana. */
  readonly exact: boolean;
  readonly cover: ListingImage | null;
  /** "72 m² · 3 amb.". */
  readonly facts: string;
}

export interface LocationOption {
  readonly id: string;
  readonly name: string;
  /** "Barrio · CABA". */
  readonly description: string;
  readonly listingCount: number;
}

const LOCATION_KIND_LABELS: Readonly<Record<PublicLocation['kind'], string>> = {
  country: 'País',
  province: 'Provincia',
  city: 'Localidad',
  neighborhood: 'Barrio',
  subneighborhood: 'Barrio',
};

export function toLocationOption(l: PublicLocation): LocationOption {
  return {
    id: l.id,
    name: l.name,
    description: [LOCATION_KIND_LABELS[l.kind], l.context]
      .filter((part) => part !== '')
      .join(' · '),
    listingCount: l.listingCount,
  };
}

export function toMapPinView(p: PublicMapPin): MapPinView {
  const location = [p.neighborhood, p.city].filter((part) => part.trim() !== '').join(', ');
  const surface = p.surfaceCoveredM2 ?? p.surfaceTotalM2;
  return {
    id: p.id,
    href: routes.property(p.slug),
    title: p.title,
    operationLabel: OPERATION_LABELS[p.operation],
    shortPrice: formatShortPrice(p.price),
    priceLabel: formatPrice(p.price),
    location,
    latitude: p.coordinates.latitude,
    longitude: p.coordinates.longitude,
    exact: p.coordinates.exact,
    cover: p.cover && toListingImage(p.cover, `${p.title}, ${location}`),
    facts: [
      surface === null ? null : formatSurface(surface),
      p.rooms === null ? null : plural(p.rooms, 'amb.', 'amb.'),
    ]
      .filter((fact) => fact !== null)
      .join(' · '),
  };
}

function locationOf(p: PropertySummary): string {
  return [p.neighborhood, p.city].filter((part) => part.trim() !== '').join(', ');
}

export function toListingImage(image: PublicImage, fallbackAlt: string): ListingImage {
  return {
    src: image.src,
    width: image.width,
    height: image.height,
    // Una descripción vacía no sirve de texto alternativo.
    alt: nonEmpty(image.description) ?? fallbackAlt,
  };
}

/** Expensas en cero son "sin cargar", no "sin expensas": no se muestran. */
function hasExpenses(
  p: PropertySummary,
): p is PropertySummary & { readonly expenses: NonNullable<PropertySummary['expenses']> } {
  return p.expenses !== null && p.expenses.amountCents > 0n;
}

function factsOf(p: PropertySummary): ListingFact[] {
  const facts: ListingFact[] = [];
  const surface = p.surfaceCoveredM2 ?? p.surfaceTotalM2;
  if (surface !== null) facts.push({ kind: 'surface', label: formatSurface(surface) });
  if (p.rooms !== null) facts.push({ kind: 'rooms', label: plural(p.rooms, 'amb.', 'amb.') });
  if (p.bedrooms !== null && p.bedrooms > 0) {
    facts.push({ kind: 'bedrooms', label: plural(p.bedrooms, 'dorm.', 'dorm.') });
  }
  if (p.bathrooms !== null && p.bathrooms > 0) {
    facts.push({ kind: 'bathrooms', label: plural(p.bathrooms, 'baño', 'baños') });
  }
  if (p.parkingSpaces !== null && p.parkingSpaces > 0) {
    facts.push({ kind: 'parking', label: plural(p.parkingSpaces, 'cochera', 'cocheras') });
  }
  return facts;
}

export function toListingCard(p: PropertySummary): ListingCard {
  const location = locationOf(p);
  return {
    id: p.id,
    slug: p.slug,
    href: routes.property(p.slug),
    title: p.title,
    operation: p.operation,
    operationLabel: OPERATION_LABELS[p.operation],
    priceLabel: formatPrice(p.price),
    hasPrice: p.price !== null,
    expensesLabel: hasExpenses(p) ? `+ ${formatMoney(p.expenses)} expensas` : null,
    propertyTypeLabel: PROPERTY_TYPE_LABELS[p.propertyType],
    location,
    address: p.address,
    cover: p.cover && toListingImage(p.cover, `${p.title}, ${location}`),
    photoCount: p.photoCount,
    featured: p.featured,
    facts: factsOf(p),
  };
}

function attributesOf(d: PropertyDetail): ListingAttribute[] {
  const rows: [string, string | null][] = [
    ['Tipo', PROPERTY_TYPE_LABELS[d.propertyType]],
    ['Superficie total', d.surfaceTotalM2 === null ? null : formatSurface(d.surfaceTotalM2)],
    ['Superficie cubierta', d.surfaceCoveredM2 === null ? null : formatSurface(d.surfaceCoveredM2)],
    [
      'Superficie semicubierta',
      d.surfaceSemiCoveredM2 === null ? null : formatSurface(d.surfaceSemiCoveredM2),
    ],
    ['Superficie del terreno', d.surfaceLandM2 === null ? null : formatSurface(d.surfaceLandM2)],
    ['Ambientes', d.rooms === null ? null : String(d.rooms)],
    ['Dormitorios', d.bedrooms === null ? null : String(d.bedrooms)],
    ['Baños', d.bathrooms === null ? null : String(d.bathrooms)],
    ['Toilettes', d.toilets === null || d.toilets === 0 ? null : String(d.toilets)],
    ['Cocheras', d.parkingSpaces === null ? null : String(d.parkingSpaces)],
    [
      'Antigüedad',
      d.ageYears === null ? null : d.ageYears === 0 ? 'A estrenar' : `${d.ageYears} años`,
    ],
    ['Estado', labelOf(CONDITION_LABELS, d.condition)],
    ['Disposición', labelOf(DISPOSITION_LABELS, d.disposition)],
    ['Orientación', labelOf(ORIENTATION_LABELS, d.orientation)],
    ['Frente', d.frontM === null ? null : `${d.frontM} m`],
    ['Fondo', d.depthM === null ? null : `${d.depthM} m`],
    ['Expensas', hasExpenses(d) ? formatMoney(d.expenses) : null],
    ['Apto crédito', d.creditEligible ? 'Sí' : null],
    ['Apto profesional', d.professionalUse ? 'Sí' : null],
    ['Amoblado', d.isFurnished ? 'Sí' : null],
  ];
  return rows.flatMap(([label, value]) => (value === null ? [] : [{ label, value }]));
}

function featureGroupsOf(d: PropertyDetail): ListingDetail['featureGroups'] {
  const kinds = ['room', 'amenity', 'service'] as const;
  return kinds.flatMap((kind) => {
    const names = d.features.filter((f) => f.kind === kind).map((f) => f.name);
    return names.length === 0 ? [] : [{ label: FEATURE_KIND_LABELS[kind], names }];
  });
}

export function toListingDetail(d: PropertyDetail): ListingDetail {
  const card = toListingCard(d);
  const alt = `${d.title}, ${card.location}`;
  return {
    ...card,
    code: d.code,
    offer: d.price && {
      amount: Number(d.price.amountCents / 100n),
      currency: d.price.currency,
    },
    surfaceM2: d.surfaceCoveredM2 ?? d.surfaceTotalM2,
    rooms: d.rooms,
    description: htmlToText(d.description),
    otherOperations: d.operations
      .filter((o) => o.operation !== d.operation)
      .map((o) => ({ label: OPERATION_LABELS[o.operation], value: formatPrice(o.price) })),
    photos: d.photos.map((photo, index) => toListingImage(photo, `${alt}, foto ${index + 1}`)),
    floorPlans: d.floorPlans.map((plan, index) =>
      toListingImage(plan, `${alt}, plano ${index + 1}`),
    ),
    coordinates: d.coordinates,
    attributes: attributesOf(d),
    featureGroups: featureGroupsOf(d),
    videoUrls: d.videoUrls,
    tourUrls: d.tourUrls,
    province: d.province,
    propertyType: d.propertyType,
    updatedAt: d.updatedAt.toISOString(),
  };
}
