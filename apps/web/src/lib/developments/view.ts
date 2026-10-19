import type {
  DevelopmentSummary,
  PublishedDevelopmentDetail,
} from '@norde/core/properties/contracts';

import { formatMoney } from '../properties/format';
import { FEATURE_KIND_LABELS } from '../properties/labels';
import { toListingImage, type ListingAttribute, type ListingImage } from '../properties/view';
import { routes } from '../seo/routes';
import { CONSTRUCTION_STATUS_LABELS, DEVELOPMENT_TYPE_LABELS } from './labels';

// Lo que muestran las tarjetas y la ficha de un emprendimiento, ya formateado y serializable (sin
// `bigint` ni `Date`): así se puede guardar en el caché de Next.

export interface DevelopmentCard {
  readonly id: string;
  readonly slug: string;
  readonly href: string;
  readonly name: string;
  readonly typeLabel: string | null;
  readonly constructionLabel: string | null;
  /** "Entrega: diciembre de 2027". */
  readonly deliveryLabel: string | null;
  /** "Desde USD 95.000", o `null` si ninguna unidad muestra su precio. */
  readonly priceFromLabel: string | null;
  /** "4 unidades disponibles". */
  readonly unitsLabel: string;
  /** "Palermo, CABA". */
  readonly location: string;
  readonly address: string | null;
  readonly cover: ListingImage | null;
  readonly photoCount: number;
}

export interface DevelopmentDetailView extends DevelopmentCard {
  readonly code: string;
  readonly availableUnitCount: number;
  /** El "desde" como número (unidades), para el JSON-LD. */
  readonly lowPrice: { readonly amount: number; readonly currency: string } | null;
  readonly description: string;
  readonly province: string;
  readonly coordinates: { readonly latitude: number; readonly longitude: number } | null;
  readonly attributes: readonly ListingAttribute[];
  readonly financingDetails: string | null;
  readonly featureGroups: readonly { readonly label: string; readonly names: readonly string[] }[];
  readonly photos: readonly ListingImage[];
  readonly floorPlans: readonly ListingImage[];
  readonly videoUrls: readonly string[];
  readonly tourUrls: readonly string[];
  readonly updatedAt: string;
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** `2027-12-01` → "diciembre de 2027". Sin `Date`: la fecha no tiene hora ni zona. */
export function formatDeliveryDate(date: string): string | null {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${month} de ${match[1]}` : null;
}

function locationOf(d: DevelopmentSummary): string {
  return [d.neighborhood, d.city].filter((part) => part.trim() !== '').join(', ');
}

function unitsLabel(count: number): string {
  if (count === 0) return 'Consultá por unidades';
  return count === 1 ? '1 unidad disponible' : `${count} unidades disponibles`;
}

export function toDevelopmentCard(d: DevelopmentSummary): DevelopmentCard {
  const location = locationOf(d);
  const delivery = d.deliveryDate === null ? null : formatDeliveryDate(d.deliveryDate);
  return {
    id: d.id,
    slug: d.slug,
    href: routes.development(d.slug),
    name: d.name,
    typeLabel: d.developmentType === null ? null : DEVELOPMENT_TYPE_LABELS[d.developmentType],
    constructionLabel:
      d.constructionStatus === null ? null : CONSTRUCTION_STATUS_LABELS[d.constructionStatus],
    deliveryLabel: delivery && `Entrega: ${delivery}`,
    priceFromLabel: d.priceFrom && `Desde ${formatMoney(d.priceFrom)}`,
    unitsLabel: unitsLabel(d.availableUnitCount),
    location,
    address: d.address,
    cover: d.cover && toListingImage(d.cover, `${d.name}, ${location}`),
    photoCount: d.photoCount,
  };
}

function attributesOf(d: PublishedDevelopmentDetail): ListingAttribute[] {
  const delivery = d.deliveryDate === null ? null : formatDeliveryDate(d.deliveryDate);
  const rows: [string, string | null][] = [
    ['Tipo', d.developmentType === null ? null : DEVELOPMENT_TYPE_LABELS[d.developmentType]],
    [
      'Estado de obra',
      d.constructionStatus === null ? null : CONSTRUCTION_STATUS_LABELS[d.constructionStatus],
    ],
    ['Entrega estimada', delivery],
    ['Financiación', d.isFinanced ? 'Sí' : null],
    ['Acepta permuta', d.acceptsSwap ? 'Sí' : null],
    ['Escritura inmediata', d.immediateDeed ? 'Sí' : null],
  ];
  return rows.flatMap(([label, value]) => (value === null ? [] : [{ label, value }]));
}

function featureGroupsOf(d: PublishedDevelopmentDetail): DevelopmentDetailView['featureGroups'] {
  const kinds = ['room', 'amenity', 'service'] as const;
  return kinds.flatMap((kind) => {
    const names = d.features.filter((f) => f.kind === kind).map((f) => f.name);
    return names.length === 0 ? [] : [{ label: FEATURE_KIND_LABELS[kind], names }];
  });
}

export function toDevelopmentDetail(d: PublishedDevelopmentDetail): DevelopmentDetailView {
  const card = toDevelopmentCard(d);
  const alt = card.location === '' ? d.name : `${d.name}, ${card.location}`;
  return {
    ...card,
    code: d.code,
    availableUnitCount: d.availableUnitCount,
    lowPrice: d.priceFrom && {
      amount: Number(d.priceFrom.amountCents / 100n),
      currency: d.priceFrom.currency,
    },
    description: d.description,
    province: d.province,
    coordinates: d.coordinates && {
      latitude: d.coordinates.latitude,
      longitude: d.coordinates.longitude,
    },
    attributes: attributesOf(d),
    financingDetails: d.financingDetails,
    featureGroups: featureGroupsOf(d),
    photos: d.photos.map((photo, index) => toListingImage(photo, `${alt}, foto ${index + 1}`)),
    floorPlans: d.floorPlans.map((plan, index) =>
      toListingImage(plan, `${alt}, plano ${index + 1}`),
    ),
    videoUrls: d.videoUrls,
    tourUrls: d.tourUrls,
    updatedAt: d.updatedAt.toISOString(),
  };
}
