import type {
  ConstructionStatusValue,
  DevelopmentHistoryCategory,
  DevelopmentStatusValue,
  DevelopmentType,
} from '@norde/core/properties/contracts';
import type { StatusTone } from '@norde/ui/components/status-pill';

// Cómo se muestran los valores de los contracts de emprendimientos.

export const DEVELOPMENT_TYPE_LABELS: Readonly<Record<DevelopmentType, string>> = {
  building: 'Edificio',
  gated_community: 'Barrio cerrado',
  housing_complex: 'Complejo de viviendas',
  office_building: 'Edificio de oficinas',
  lots: 'Loteo',
  other: 'Otro',
};

export const DEVELOPMENT_STATUS_DISPLAY: Readonly<
  Record<DevelopmentStatusValue, { readonly label: string; readonly tone: StatusTone }>
> = {
  loading: { label: 'Cargando información', tone: 'gray' },
  marketing: { label: 'Comercializando', tone: 'green' },
};

export const CONSTRUCTION_STATUS_LABELS: Readonly<Record<ConstructionStatusValue, string>> = {
  pre_sale: 'En pozo',
  under_construction: 'En construcción',
  finished: 'Terminado',
};

export const DEVELOPMENT_TABS = ['detalles', 'unidades', 'historial'] as const;
export type DevelopmentTab = (typeof DEVELOPMENT_TABS)[number];

export const DEVELOPMENT_TAB_LABELS: Readonly<Record<DevelopmentTab, string>> = {
  detalles: 'Detalles',
  unidades: 'Unidades',
  historial: 'Historial',
};

export const DEVELOPMENT_HISTORY_CATEGORY_LABELS: Readonly<
  Record<DevelopmentHistoryCategory, string>
> = {
  fields: 'Datos de la ficha',
  status: 'Estado',
  units: 'Unidades',
  assignments: 'Etiquetas',
};

/** Qué hizo cada entrada del historial, en la voz de la línea ("Camila cambió el estado"). */
export const DEVELOPMENT_HISTORY_ACTION_LABELS: Readonly<Record<string, string>> = {
  'development.created': 'dio de alta el emprendimiento',
  'development.updated': 'editó la ficha',
  'development.status_changed': 'cambió el estado',
  'development.tags_changed': 'cambió las etiquetas',
  'development.deleted': 'mandó el emprendimiento a la papelera',
  'development.restored': 'restauró el emprendimiento',
  'development.unit_added': 'sumó una unidad',
};

/** Nombre de cada campo del historial del emprendimiento. */
export const DEVELOPMENT_HISTORY_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'Código',
  name: 'Nombre',
  developmentType: 'Tipo de desarrollo',
  status: 'Estado',
  constructionStatus: 'Estado de obra',
  deliveryDate: 'Fecha de entrega',
  privateAddress: 'Dirección privada',
  publishAddress: 'Dirección para publicar',
  portalTitle: 'Título para portales',
  locationId: 'Ubicación',
  latitude: 'Latitud',
  longitude: 'Longitud',
  developerName: 'Desarrollista',
  commercialContactClientId: 'Contacto comercial',
  websiteUrl: 'Página web',
  description: 'Descripción',
  financingDetails: 'Financiación',
  isFinanced: 'Financiado',
  acceptsSwap: 'Acepta permuta',
  immediateDeed: 'Escritura inmediata',
  featureIds: 'Servicios y adicionales',
  tagIds: 'Etiquetas',
  producerUserId: 'Captador',
  branchId: 'Sucursal',
  unitId: 'Unidad',
  unitCode: 'Código de la unidad',
};
