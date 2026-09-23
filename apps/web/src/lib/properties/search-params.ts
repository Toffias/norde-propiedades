import type { Operation, PropertyType } from '@norde/core/properties/contracts';

// Parámetros del buscador de propiedades en la URL (`/propiedades?operacion=venta&tipo=casa`).
// Van en español porque son parte de URLs públicas; el listado (F3) los traduce a los
// valores del core con estos mismos mapas.

interface Option<T extends string> {
  readonly value: T;
  /** Valor en la URL. */
  readonly param: string;
  readonly label: string;
}

export const SEARCH_PARAM_NAMES = {
  operation: 'operacion',
  propertyType: 'tipo',
  location: 'zona',
} as const;

export const OPERATION_OPTIONS: readonly Option<Operation>[] = [
  { value: 'sale', param: 'venta', label: 'Comprar' },
  { value: 'rent', param: 'alquiler', label: 'Alquilar' },
  { value: 'temporary_rent', param: 'alquiler-temporario', label: 'Alquiler temporario' },
];

export const PROPERTY_TYPE_OPTIONS: readonly Option<PropertyType>[] = [
  { value: 'apartment', param: 'departamento', label: 'Departamento' },
  { value: 'house', param: 'casa', label: 'Casa' },
  { value: 'ph', param: 'ph', label: 'PH' },
  { value: 'land', param: 'terreno', label: 'Terreno' },
  { value: 'office', param: 'oficina', label: 'Oficina' },
  { value: 'commercial', param: 'local', label: 'Local comercial' },
  { value: 'garage', param: 'cochera', label: 'Cochera' },
  { value: 'warehouse', param: 'galpon', label: 'Galpón' },
];

export function operationFromParam(param: string | undefined): Operation | undefined {
  return OPERATION_OPTIONS.find((o) => o.param === param)?.value;
}

export function propertyTypeFromParam(param: string | undefined): PropertyType | undefined {
  return PROPERTY_TYPE_OPTIONS.find((o) => o.param === param)?.value;
}
