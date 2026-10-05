import type {
  MoneyDto,
  Operation,
  PropertyDetail,
  PropertySummary,
  PropertyType,
} from '@norde/core/properties';

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

/** Vista compacta para el modelo: lo necesario para responder, sin descripción larga. */
export function presentSummary(property: PropertySummary, siteUrl: string) {
  return {
    id: property.id,
    title: property.title,
    operation: OPERATION_LABEL[property.operation],
    type: PROPERTY_TYPE_LABEL[property.propertyType],
    price: property.price ? formatMoney(property.price) : 'Consultar',
    // Una propiedad puede estar en venta y en alquiler a la vez.
    operations: property.operations.map(
      (o) => `${OPERATION_LABEL[o.operation]}: ${o.price ? formatMoney(o.price) : 'Consultar'}`,
    ),
    expenses: property.expenses ? formatMoney(property.expenses) : null,
    rooms: property.rooms,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    surfaceTotalM2: property.surfaceTotalM2,
    surfaceCoveredM2: property.surfaceCoveredM2,
    neighborhood: property.neighborhood,
    city: property.city,
    amenities: property.amenities,
    url: propertyUrl(siteUrl, property.slug),
    hasPhotos: property.photoCount > 0,
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
