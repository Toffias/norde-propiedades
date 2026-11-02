import type {
  MoneyDto,
  Operation,
  PropertyDetail,
  PropertySummary,
  PropertyType,
} from '@norde/core/properties';

import type { ShownProperty } from './turn-context';

export const OPERATION_LABEL: Readonly<Record<Operation, string>> = {
  sale: 'Venta',
  rent: 'Alquiler',
  temporary_rent: 'Alquiler temporario',
};

export const PROPERTY_TYPE_LABEL: Readonly<Record<PropertyType, string>> = {
  apartment: 'Departamento',
  house: 'Casa',
  ph: 'PH',
  land: 'Terreno',
  office: 'Oficina',
  commercial: 'Local comercial',
  garage: 'Cochera',
  warehouse: 'Galpón',
  storage: 'Depósito',
};

const NUMBER = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

/** `USD 150.000`, `$ 550.000`. Los precios de propiedades no llevan centavos. */
export function formatMoney(money: MoneyDto): string {
  const units = NUMBER.format(money.amountCents / 100n);
  return money.currency === 'USD' ? `USD ${units}` : `$ ${units}`;
}

/** Monto que dice el modelo (en pesos o dólares) → centavos. */
export function toCents(amount: number): bigint {
  return BigInt(Math.round(amount * 100));
}

export function propertyUrl(siteUrl: string, slug: string): string {
  return new URL(`/propiedades/${encodeURIComponent(slug)}`, siteUrl).toString();
}

const FICHA_PATH = /\/propiedades\/([^/?#\s]+)/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cómo buscar la propiedad que nombró el modelo: el link de una ficha que pegó el cliente (con o
 * sin dominio), el id de una tool o, si no es ninguno, el código que muestra la web (`DEP0001`).
 */
export function propertyReference(
  reference: string,
): { readonly propertyId: string } | { readonly slug: string } | { readonly code: string } {
  const trimmed = reference.trim();
  const slug = FICHA_PATH.exec(trimmed)?.[1];
  if (slug === undefined) return UUID.test(trimmed) ? { propertyId: trimmed } : { code: trimmed };
  try {
    return { slug: decodeURIComponent(slug) };
  } catch {
    // Escape inválido (%E0): se busca tal cual y, si no existe, la tool lo informa.
    return { slug };
  }
}

/** Vista compacta para el modelo: lo necesario para responder, sin descripción larga. */
export function presentSummary(property: PropertySummary, siteUrl: string) {
  return {
    id: property.id,
    title: property.title,
    operation: OPERATION_LABEL[property.operation],
    type: PROPERTY_TYPE_LABEL[property.propertyType],
    price: property.price ? formatMoney(property.price) : 'Consultar',
    // Una propiedad puede estar en venta y en alquiler a la vez. Con una sola operación, ya está
    // en `operation` y `price`: no se repite (son tokens en cada búsqueda).
    ...(property.operations.length > 1
      ? {
          operations: property.operations.map(
            (o) =>
              `${OPERATION_LABEL[o.operation]}: ${o.price ? formatMoney(o.price) : 'Consultar'}`,
          ),
        }
      : {}),
    expenses: property.expenses ? formatMoney(property.expenses) : null,
    rooms: property.rooms,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    surfaceTotalM2: property.surfaceTotalM2,
    // La cubierta solo si suma: en un departamento suele ser igual a la total.
    ...(property.surfaceCoveredM2 !== null && property.surfaceCoveredM2 !== property.surfaceTotalM2
      ? { surfaceCoveredM2: property.surfaceCoveredM2 }
      : {}),
    neighborhood: property.neighborhood,
    city: property.city,
    amenities: property.amenities,
    url: propertyUrl(siteUrl, property.slug),
    hasPhotos: property.photoCount > 0,
  };
}

/** Datos de la tarjeta de la propiedad en el chat del sitio. */
export function presentCard(property: PropertySummary, siteUrl: string): ShownProperty {
  return {
    id: property.id,
    title: property.title,
    url: propertyUrl(siteUrl, property.slug),
    photoUrl: property.cover ? new URL(property.cover.src, siteUrl).toString() : null,
    operation: OPERATION_LABEL[property.operation],
    price: property.price ? formatMoney(property.price) : 'Consultar precio',
    location: [property.neighborhood, property.city].filter(Boolean).join(', '),
    rooms: property.rooms,
    bedrooms: property.bedrooms,
    surfaceM2: property.surfaceTotalM2 ?? property.surfaceCoveredM2,
  };
}

export function presentDetail(property: PropertyDetail, siteUrl: string) {
  return {
    ...presentSummary(property, siteUrl),
    description: property.description,
    address: property.address ?? 'A confirmar con el asesor',
    photos: property.photoCount,
  };
}
