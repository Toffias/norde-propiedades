// Valores de los catálogos fijos de propiedades, para los formularios y los contracts.

export const OPERATIONS = ['sale', 'rent', 'temporary_rent'] as const;
export type Operation = (typeof OPERATIONS)[number];

export const PROPERTY_TYPES = [
  'apartment',
  'house',
  'ph',
  'land',
  'office',
  'commercial',
  'garage',
  'warehouse',
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const CURRENCIES = ['ARS', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const PROPERTY_STATUS_VALUES = [
  'draft',
  'available',
  'reserved',
  'sold',
  'rented',
  'paused',
  'withdrawn',
] as const;
export type PropertyStatusValue = (typeof PROPERTY_STATUS_VALUES)[number];

/** Los que se eligen a mano: "Reservada" la marca una reserva (#13). */
export const MANUAL_STATUS_VALUES = [
  'draft',
  'available',
  'sold',
  'rented',
  'paused',
  'withdrawn',
] as const satisfies readonly PropertyStatusValue[];
