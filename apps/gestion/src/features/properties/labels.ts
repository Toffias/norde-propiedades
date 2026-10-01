import type {
  BulkSkipReason,
  Currency,
  FeatureKindValue,
  GridColumnValue,
  LocationKindValue,
  Operation,
  PropertyAttributeGroupValue,
  PropertyAttributeValue,
  PropertyExportFormat,
  PropertyLayoutValue,
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

export const LAYOUT_LABELS: Readonly<Record<PropertyLayoutValue, string>> = {
  list: 'Lista',
  cards: 'Tarjetas',
  map: 'Mapa',
};

export const LOCATION_KIND_LABELS: Readonly<Record<LocationKindValue, string>> = {
  country: 'País',
  province: 'Provincia',
  city: 'Localidad',
  neighborhood: 'Barrio',
  subneighborhood: 'Subbarrio',
};

export const FEATURE_KIND_LABELS: Readonly<Record<FeatureKindValue, string>> = {
  service: 'Servicios',
  room: 'Ambientes',
  amenity: 'Adicionales',
};

export const ATTRIBUTE_GROUP_LABELS: Readonly<Record<PropertyAttributeGroupValue, string>> = {
  general: 'Información general',
  surfaces: 'Superficies',
  operation: 'Operación y cotización',
  catalogs: 'Servicios, ambientes y adicionales',
};

export const ATTRIBUTE_LABELS: Readonly<Record<PropertyAttributeValue, string>> = {
  rooms: 'Ambientes',
  bedrooms: 'Dormitorios',
  bathrooms: 'Baños',
  toilets: 'Toilettes',
  parkingSpaces: 'Cocheras',
  ageYears: 'Antigüedad',
  orientation: 'Orientación',
  condition: 'Estado de conservación',
  disposition: 'Disposición',
  isFurnished: 'Amoblado',
  professionalUse: 'Apto profesional',
  surfaceTotalM2: 'Superficie total',
  surfaceCoveredM2: 'Superficie cubierta',
  surfaceSemiCoveredM2: 'Superficie semicubierta',
  surfaceLandM2: 'Superficie del terreno',
  frontM: 'Frente',
  depthM: 'Fondo',
  expenses: 'Expensas',
  creditEligible: 'Apto crédito',
  isExclusive: 'Exclusividad',
  acceptsSwap: 'Acepta permuta',
  immediateDeed: 'Escritura inmediata',
  hasFinancing: 'Financiación',
  services: 'Servicios',
  roomFeatures: 'Ambientes',
  amenities: 'Adicionales',
};

export const GRID_COLUMN_LABELS: Readonly<Record<GridColumnValue, string>> = {
  rooms: 'Ambientes',
  bedrooms: 'Dormitorios',
  bathrooms: 'Baños',
  parkingSpaces: 'Cocheras',
  surfaceTotalM2: 'Sup. total',
  surfaceCoveredM2: 'Sup. cubierta',
  ageYears: 'Antigüedad',
  producer: 'Captador',
  createdAt: 'Alta',
  updatedAt: 'Actualizada',
};

export const EXPORT_FORMAT_LABELS: Readonly<Record<PropertyExportFormat, string>> = {
  xlsx: 'Excel (.xlsx)',
  csv: 'CSV',
  pdf: 'PDF',
};

export const BULK_SKIP_LABELS: Readonly<Record<BulkSkipReason, string>> = {
  forbidden: 'no la podés editar',
  in_trash: 'está en la papelera',
  invalid_transition: 'no puede pasar a ese estado',
  operation_not_found: 'no tiene esa operación',
};
