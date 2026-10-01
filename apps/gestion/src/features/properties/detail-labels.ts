import type {
  ConditionValue,
  CustomAttributeKindValue,
  DispositionValue,
  MediaKindValue,
  OrientationValue,
  PropertyDocumentKindValue,
  PropertyDocumentStatusValue,
  PropertyHistoryCategory,
} from '@norde/core/properties/contracts';
import type { StatusTone } from '@norde/ui/components/status-pill';

import { ATTRIBUTE_LABELS } from './labels';

// Cómo se muestran en la ficha los valores de los contracts de propiedades.

export const DETAIL_TABS = [
  'detalles',
  'multimedia',
  'archivos',
  'historial',
  'contactos',
  'estadisticas',
] as const;
export type DetailTab = (typeof DETAIL_TABS)[number];

export const DETAIL_TAB_LABELS: Readonly<Record<DetailTab, string>> = {
  detalles: 'Detalles',
  multimedia: 'Multimedia',
  archivos: 'Archivos',
  historial: 'Historial',
  contactos: 'Contactos',
  estadisticas: 'Estadísticas',
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

export const CONDITION_LABELS: Readonly<Record<ConditionValue, string>> = {
  brand_new: 'A estrenar',
  excellent: 'Excelente',
  very_good: 'Muy bueno',
  good: 'Bueno',
  fair: 'Regular',
  to_renovate: 'A reciclar',
};

export const DISPOSITION_LABELS: Readonly<Record<DispositionValue, string>> = {
  front: 'Frente',
  back: 'Contrafrente',
  internal: 'Interno',
  lateral: 'Lateral',
};

export const CUSTOM_ATTRIBUTE_KIND_LABELS: Readonly<Record<CustomAttributeKindValue, string>> = {
  text: 'Texto',
  number: 'Número',
  boolean: 'Sí / No',
  select: 'Lista de opciones',
};

export const MEDIA_KIND_LABELS: Readonly<Record<MediaKindValue, string>> = {
  photo: 'Foto',
  floor_plan: 'Plano',
  video: 'Video',
  tour_360: 'Recorrido 360',
};

export const DOCUMENT_KIND_LABELS: Readonly<Record<PropertyDocumentKindValue, string>> = {
  sheet: 'Ficha en PDF',
  showcase: 'PDF de vidriera',
  owner_report: 'Reporte al propietario',
};

export const DOCUMENT_STATUS_DISPLAY: Readonly<
  Record<PropertyDocumentStatusValue, { readonly label: string; readonly tone: StatusTone }>
> = {
  pending: { label: 'Armándose', tone: 'amber' },
  ready: { label: 'Listo', tone: 'green' },
  failed: { label: 'Falló', tone: 'red' },
};

export const HISTORY_CATEGORY_LABELS: Readonly<Record<PropertyHistoryCategory, string>> = {
  fields: 'Datos de la ficha',
  price: 'Precio',
  status: 'Estado',
  media: 'Fotos y videos',
  files: 'Archivos',
  publication: 'Publicación',
  assignments: 'Captador y etiquetas',
};

/** Qué hizo cada entrada del historial, en la voz de la línea ("Camila cambió el estado"). */
export const HISTORY_ACTION_LABELS: Readonly<Record<string, string>> = {
  'property.created': 'dio de alta la propiedad',
  'property.updated': 'editó la ficha',
  'property.status_changed': 'cambió el estado',
  'property.producer_changed': 'cambió el captador',
  'property.tags_changed': 'cambió las etiquetas',
  'property.publication_changed': 'cambió la publicación',
  'property.deleted': 'mandó la propiedad a la papelera',
  'property.restored': 'restauró la propiedad',
  'property.media_added': 'agregó multimedia',
  'property.media_updated': 'editó una foto',
  'property.media_reordered': 'reordenó la galería',
  'property.media_deleted': 'borró multimedia',
  'property.cover_changed': 'cambió la portada',
  'property.attachment_added': 'subió un archivo',
  'property.attachment_updated': 'editó un archivo',
  'property.attachment_deleted': 'borró un archivo',
  'property.exported': 'pidió un PDF',
  'property.owner_report_sent': 'mandó el reporte al propietario',
};

/** Nombre de cada campo del historial. Los de las filas hijas (`media.<id>.campo`) usan el último tramo. */
export const HISTORY_FIELD_LABELS: Readonly<Record<string, string>> = {
  ...ATTRIBUTE_LABELS,
  code: 'Código',
  propertyType: 'Tipo',
  status: 'Estado',
  street: 'Calle',
  streetNumber: 'Altura',
  floor: 'Piso',
  unit: 'Unidad',
  neighborhood: 'Barrio',
  city: 'Localidad',
  province: 'Provincia',
  publishAddress: 'Dirección para publicar',
  portalTitle: 'Título para portales',
  latitude: 'Latitud',
  longitude: 'Longitud',
  locationId: 'Ubicación',
  operations: 'Operaciones y precios',
  producerUserId: 'Captador',
  branchId: 'Sucursal',
  description: 'Descripción',
  expensesCents: 'Expensas',
  featureIds: 'Servicios, ambientes y adicionales',
  tagIds: 'Etiquetas',
  customAttributes: 'Atributos personalizados',
  maintenanceUserId: 'Usuario de mantenimiento',
  appraiserUserIds: 'Tasadores',
  keysLocation: 'Ubicación de las llaves',
  legalInfo: 'Información legal',
  internalComments: 'Comentarios internos',
  publishedOnWeb: 'Publicada en la web',
  showPriceOnWeb: 'Precio en la web',
  featured: 'Destacada',
  showExactAddress: 'Dirección exacta en la web',
  mediaOrder: 'Orden de la galería',
  coverMediaId: 'Portada',
  documentId: 'PDF',
  periodFrom: 'Desde',
  periodTo: 'Hasta',
  kind: 'Tipo',
  position: 'Posición',
  isCover: 'Portada',
  showOnWeb: 'Mostrar en la web',
  includeInPdf: 'Incluir en el PDF',
  rotation: 'Rotación',
  externalUrl: 'Link',
  name: 'Nombre',
  mimeType: 'Tipo de archivo',
  sizeBytes: 'Tamaño',
};

export const SEND_CHANNEL_LABELS: Readonly<Record<string, string>> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
};

export const REACTION_LABELS: Readonly<Record<string, string>> = {
  liked: 'Le gustó',
  disliked: 'No le gustó',
};

export const PORTAL_STATUS_DISPLAY: Readonly<
  Record<string, { readonly label: string; readonly tone: StatusTone }>
> = {
  pending: { label: 'Pendiente', tone: 'gray' },
  published: { label: 'Publicada', tone: 'green' },
  paused: { label: 'Pausada', tone: 'amber' },
  error: { label: 'Con error', tone: 'red' },
  unpublished: { label: 'Despublicada', tone: 'gray' },
};
