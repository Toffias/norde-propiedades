import type {
  ConditionValue,
  DispositionValue,
  FeatureKindValue,
  Operation,
  OrientationValue,
  PropertyType,
} from '@norde/core/properties/contracts';

// Textos de la web para los valores del core. Viven acá: son textos de UI.

export const OPERATION_LABELS: Readonly<Record<Operation, string>> = {
  sale: 'Venta',
  rent: 'Alquiler',
  temporary_rent: 'Alquiler temporario',
};

export const PROPERTY_TYPE_LABELS: Readonly<Record<PropertyType, string>> = {
  apartment: 'Departamento',
  house: 'Casa',
  ph: 'PH',
  land: 'Terreno',
  office: 'Oficina',
  commercial: 'Local comercial',
  garage: 'Cochera',
  warehouse: 'Galpón',
};

/** Plural para los títulos del listado ("Departamentos en venta"). */
export const PROPERTY_TYPE_PLURALS: Readonly<Record<PropertyType, string>> = {
  apartment: 'Departamentos',
  house: 'Casas',
  ph: 'PH',
  land: 'Terrenos',
  office: 'Oficinas',
  commercial: 'Locales comerciales',
  garage: 'Cocheras',
  warehouse: 'Galpones',
};

/** "en venta", "en alquiler": para títulos. */
export const OPERATION_PHRASES: Readonly<Record<Operation, string>> = {
  sale: 'en venta',
  rent: 'en alquiler',
  temporary_rent: 'en alquiler temporario',
};

export const CONDITION_LABELS: Readonly<Record<ConditionValue, string>> = {
  brand_new: 'A estrenar',
  excellent: 'Excelente',
  very_good: 'Muy bueno',
  good: 'Bueno',
  fair: 'Regular',
  to_renovate: 'A reciclar',
};

export const ORIENTATION_LABELS: Readonly<Record<OrientationValue, string>> = {
  north: 'Norte',
  south: 'Sur',
  east: 'Este',
  west: 'Oeste',
  northeast: 'Noreste',
  northwest: 'Noroeste',
  southeast: 'Sudeste',
  southwest: 'Sudoeste',
};

export const DISPOSITION_LABELS: Readonly<Record<DispositionValue, string>> = {
  front: 'Frente',
  back: 'Contrafrente',
  internal: 'Interno',
  lateral: 'Lateral',
};

export const FEATURE_KIND_LABELS: Readonly<Record<FeatureKindValue, string>> = {
  service: 'Servicios',
  room: 'Ambientes',
  amenity: 'Amenities',
};

/** El valor del core si es uno conocido, para buscar su etiqueta sin `as`. */
export function labelOf<K extends string>(
  labels: Readonly<Record<K, string>>,
  value: string | null,
): string | null {
  if (value === null) return null;
  const entry = Object.entries<string>(labels).find(([key]) => key === value);
  return entry?.[1] ?? null;
}
