// Valores del dominio de propiedades. Los contracts tienen la misma lista para los formularios (el
// dominio no importa contracts); un test verifica que coincidan.

export const PROPERTY_OPERATIONS = ['sale', 'rent', 'temporary_rent'] as const;
export type PropertyOperationKind = (typeof PROPERTY_OPERATIONS)[number];

export const PROPERTY_KINDS = [
  'apartment',
  'house',
  'ph',
  'land',
  'office',
  'commercial',
  'garage',
  'warehouse',
] as const;
export type PropertyKind = (typeof PROPERTY_KINDS)[number];

export const PRICE_CURRENCIES = ['ARS', 'USD'] as const;
export type PriceCurrency = (typeof PRICE_CURRENCIES)[number];

/** Cómo se nombra cada tipo en la dirección para publicar y en el título para portales. */
export const PROPERTY_KIND_LABELS: Readonly<Record<PropertyKind, string>> = {
  apartment: 'Departamento',
  house: 'Casa',
  ph: 'PH',
  land: 'Terreno',
  office: 'Oficina',
  commercial: 'Local',
  garage: 'Cochera',
  warehouse: 'Galpón',
};

export const OPERATION_LABELS: Readonly<Record<PropertyOperationKind, string>> = {
  sale: 'en venta',
  rent: 'en alquiler',
  temporary_rent: 'en alquiler temporario',
};
