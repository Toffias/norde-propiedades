import type {
  Currency,
  Operation,
  PropertyScopeValue,
  PropertyStatusValue,
  PropertyType,
} from '@norde/core/properties/contracts';
import type { StatusTone } from '@norde/ui/components/status-pill';

// Cómo se muestran en el panel los valores de los contracts de propiedades.

export const PROPERTY_TYPE_LABELS: Readonly<Record<PropertyType, string>> = {
  apartment: 'Departamento',
  house: 'Casa',
  ph: 'PH',
  land: 'Terreno',
  office: 'Oficina',
  commercial: 'Local',
  garage: 'Cochera',
  warehouse: 'Galpón',
};

export const OPERATION_LABELS: Readonly<Record<Operation, string>> = {
  sale: 'Venta',
  rent: 'Alquiler',
  temporary_rent: 'Alquiler temporario',
};

export const CURRENCY_LABELS: Readonly<Record<Currency, string>> = {
  USD: 'Dólares (US$)',
  ARS: 'Pesos ($)',
};

export const PROPERTY_STATUS_DISPLAY: Readonly<
  Record<PropertyStatusValue, { readonly label: string; readonly tone: StatusTone }>
> = {
  draft: { label: 'Borrador', tone: 'gray' },
  available: { label: 'Disponible', tone: 'green' },
  reserved: { label: 'Reservada', tone: 'amber' },
  sold: { label: 'Vendida', tone: 'red' },
  rented: { label: 'Alquilada', tone: 'red' },
  paused: { label: 'Pausada', tone: 'amber' },
  withdrawn: { label: 'Dada de baja', tone: 'gray' },
};

export const SCOPE_LABELS: Readonly<Record<PropertyScopeValue, string>> = {
  all: 'Todas',
  mine: 'Mis captaciones',
  branch: 'Mi sucursal',
};
