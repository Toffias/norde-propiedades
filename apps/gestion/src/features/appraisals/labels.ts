import type {
  AppraisalSourceValue,
  AppraisalStatusGroupValue,
  AppraisalStatusValue,
} from '@norde/core/appraisals/contracts';
import type { StatusTone } from '@norde/ui/components/status-pill';

// Textos de las tasaciones (#12) para la UI.

export const APPRAISAL_STATUS_DISPLAY: Readonly<
  Record<AppraisalStatusValue, { readonly label: string; readonly tone: StatusTone }>
> = {
  requested: { label: 'Solicitada', tone: 'amber' },
  visit_scheduled: { label: 'Visita agendada', tone: 'amber' },
  appraised: { label: 'Tasada', tone: 'green' },
  converted: { label: 'Ingresada', tone: 'green' },
  discarded: { label: 'Descartada', tone: 'gray' },
};

/** El filtro de estado agrupa como Tokko: Pendiente, Tasado, Caída e Ingresada. */
export const APPRAISAL_STATUS_GROUP_LABELS: Readonly<Record<AppraisalStatusGroupValue, string>> = {
  pending: 'Pendientes',
  appraised: 'Tasadas',
  discarded: 'Descartadas',
  converted: 'Ingresadas',
};

/** Qué hace cada cambio de estado, para el menú de la ficha. */
export const APPRAISAL_STATUS_ACTION_LABELS: Readonly<
  Record<Exclude<AppraisalStatusValue, 'converted'>, string>
> = {
  requested: 'Volver a solicitada',
  visit_scheduled: 'Visita agendada',
  appraised: 'Marcar tasada',
  discarded: 'Descartar',
};

export const APPRAISAL_SOURCE_LABELS: Readonly<Record<AppraisalSourceValue, string>> = {
  manual: 'Cargada en el panel',
  agent_ia: 'Agente de IA',
  web: 'Formulario de la web',
};

export const APPRAISAL_TABS = ['datos', 'resultado', 'fotos', 'historial'] as const;
export type AppraisalTab = (typeof APPRAISAL_TABS)[number];

export const APPRAISAL_TAB_LABELS: Readonly<Record<AppraisalTab, string>> = {
  datos: 'Datos',
  resultado: 'Resultado',
  fotos: 'Fotos',
  historial: 'Historial',
};

export const APPRAISAL_HISTORY_ACTION_LABELS: Readonly<Record<string, string>> = {
  'appraisal.created': 'cargó la tasación',
  'appraisal.updated': 'editó la tasación',
  'appraisal.status_changed': 'cambió el estado',
  'appraisal.deleted': 'mandó la tasación a la papelera',
  'appraisal.restored': 'restauró la tasación',
  'appraisal.client_merged': 'unificó el contacto solicitante',
  'appraisal.result_recorded': 'cargó el resultado',
  'appraisal.photo_added': 'subió una foto',
  'appraisal.photo_deleted': 'borró una foto',
  'appraisal.converted': 'convirtió la tasación en propiedad',
};

export const APPRAISAL_HISTORY_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'Código',
  source: 'Origen',
  status: 'Estado',
  requesterClientId: 'Solicitante',
  producerUserId: 'Productor',
  branchId: 'Sucursal',
  appraiserUserId: 'Tasador',
  visitAt: 'Visita',
  propertyType: 'Tipo de propiedad',
  address: 'Dirección',
  surfaceTotalM2: 'Superficie total',
  surfaceCoveredM2: 'Superficie cubierta',
  rooms: 'Ambientes',
  bedrooms: 'Dormitorios',
  bathrooms: 'Baños',
  condition: 'Estado de conservación',
  saleMinCents: 'Venta: mínimo',
  saleMaxCents: 'Venta: máximo',
  saleCurrency: 'Venta: moneda',
  rentMinCents: 'Alquiler: mínimo',
  rentMaxCents: 'Alquiler: máximo',
  rentCurrency: 'Alquiler: moneda',
  comparables: 'Comparables',
  observations: 'Observaciones',
  convertedPropertyId: 'Propiedad',
};
