import type { ActivityAreaValue, ActivityEntryRow } from '@norde/core/audit/contracts';
import type { Route } from 'next';

import { appraisalFieldLabel, formatAppraisalValue } from '../appraisals/history-format';
import { APPRAISAL_HISTORY_ACTION_LABELS } from '../appraisals/labels';
import {
  CLIENT_HISTORY_ACTION_LABELS,
  clientHistoryFieldLabel,
  formatClientHistoryValue,
} from '../clients/history-format';
import { developmentFieldLabel, formatDevelopmentValue } from '../developments/history-format';
import { DEVELOPMENT_HISTORY_ACTION_LABELS } from '../developments/labels';
import { HISTORY_ACTION_LABELS } from '../properties/detail-labels';
import { formatHistoryValue, historyFieldLabel } from '../properties/history-format';
import type { HistoryFormat } from '../shared/components/audit-history-grid';

export const ACTIVITY_AREA_LABELS: Readonly<Record<ActivityAreaValue, string>> = {
  properties: 'Propiedades',
  developments: 'Emprendimientos',
  clients: 'Contactos',
  opportunities: 'Oportunidades',
  appraisals: 'Tasaciones',
  users: 'Cuenta y usuarios',
  other: 'Configuración y otros',
};

/** Las acciones que no tienen historial en una ficha: la cuenta, oportunidades y configuración. */
const OTHER_ACTION_LABELS: Readonly<Record<string, string>> = {
  'user.signed-in': 'ingresó al panel',
  'user.signed-out': 'cerró la sesión',
  'user.password-changed': 'cambió la contraseña',
  'user.password-reset': 'blanqueó la contraseña de un usuario',
  'user.two-factor-enabled': 'activó la verificación en dos pasos',
  'user.two-factor-disabled': 'desactivó la verificación en dos pasos',
  'user.two-factor-backup-codes-regenerated': 'regeneró los códigos de respaldo',
  'user.two-factor-reset': 'reinició la verificación en dos pasos de un usuario',
  'user.created': 'dio de alta un usuario',
  'user.updated': 'editó un usuario',
  'user.permissions-changed': 'cambió los permisos de un usuario',
  'user.suspended': 'suspendió un usuario',
  'user.reactivated': 'reactivó un usuario',
  'user.imported': 'importó un usuario',
  'user.favorites_added': 'agregó favoritos',
  'user.favorites_removed': 'quitó favoritos',
  'user.favorites_merged': 'pasó favoritos al unificar contactos',
  'user.tokko_import_requested': 'pidió importar datos de Tokko',
  'user.tokko_import_finished': 'terminó de importar datos de Tokko',
  'opportunity.created': 'creó una oportunidad',
  'opportunity.assigned': 'asignó una oportunidad',
  'opportunity.reassigned': 'reasignó una oportunidad',
  'opportunity.status_changed': 'cambió la etapa de una oportunidad',
  'opportunity.closed': 'cerró una oportunidad',
  'opportunity.opened': 'reabrió una oportunidad',
  'opportunity.follow_up': 'registró un seguimiento',
  'opportunity.request_added': 'sumó un pedido a una oportunidad',
  'opportunity.referral_updated': 'editó la derivación de una oportunidad',
  'opportunity.imported': 'importó una oportunidad',
  'opportunity.bulk_requested': 'pidió una acción masiva sobre oportunidades',
  'property.imported': 'importó propiedades',
  'property.owners_imported': 'importó propietarios',
  'property.portal_publish_requested': 'pidió publicar en un portal',
  'property.portal_published': 'publicó en un portal',
  'property.portal_pause_requested': 'pidió pausar en un portal',
  'property.portal_paused': 'pausó en un portal',
  'property.portal_resume_requested': 'pidió reactivar en un portal',
  'property.portal_unpublish_requested': 'pidió despublicar de un portal',
  'property.portal_unpublished': 'despublicó de un portal',
  'property_import.finished': 'terminó de importar propiedades',
  'client_import.finished': 'terminó de importar contactos',
  'conversation.started': 'inició una conversación',
  'inquiry.received': 'registró una consulta',
  'inquiry.assigned': 'asignó una consulta',
  'opportunity_stage.reordered': 'reordenó las etapas de oportunidades',
  'opportunity_settings.updated': 'editó la configuración de oportunidades',
  'property_settings.updated': 'editó la configuración de propiedades',
  'property_type_setting.updated': 'editó la configuración de un tipo de propiedad',
  'team.member-added': 'sumó un integrante a un equipo',
  'team.member-removed': 'quitó un integrante de un equipo',
  'company_settings.updated': 'editó la configuración de la empresa',
  'branch.made-main': 'eligió la sucursal principal',
};

const ACTION_LABELS: Readonly<Record<string, string>> = {
  ...HISTORY_ACTION_LABELS,
  ...CLIENT_HISTORY_ACTION_LABELS,
  ...DEVELOPMENT_HISTORY_ACTION_LABELS,
  ...APPRAISAL_HISTORY_ACTION_LABELS,
  ...OTHER_ACTION_LABELS,
};

/** Para las acciones sin texto propio: "creó" + "una sucursal". */
const VERBS: Readonly<Record<string, string>> = {
  created: 'creó',
  updated: 'editó',
  deleted: 'borró',
  restored: 'restauró',
  renamed: 'renombró',
  moved: 'movió',
  uploaded: 'subió',
  activated: 'activó',
  deactivated: 'desactivó',
  enabled: 'activó',
  disabled: 'desactivó',
  connected: 'conectó',
  disconnected: 'desconectó',
  exported: 'exportó',
  imported: 'importó',
  requested: 'pidió',
  merged: 'unificó',
  recorded: 'registró',
  voided: 'anuló',
  closed: 'cerró',
};

const NOUNS: Readonly<Record<string, string>> = {
  branch: 'una sucursal',
  role: 'un rol',
  team: 'un equipo',
  user: 'un usuario',
  portal_account: 'una cuenta de portal',
  quick_reply: 'una respuesta rápida',
  inquiry_rule: 'una regla de consultas',
  inquiry: 'una consulta',
  conversation: 'una conversación',
  file_folder: 'una carpeta',
  company_file: 'un archivo',
  cash_movement: 'un movimiento de caja',
  cash_closing: 'un cierre de caja',
  opportunity_stage: 'una etapa de oportunidades',
  reference_code_sequence: 'una numeración de códigos',
  property_tag: 'una etiqueta de propiedades',
  property_tag_group: 'un grupo de etiquetas de propiedades',
  client_tag: 'una etiqueta de contactos',
  client_tag_group: 'un grupo de etiquetas de contactos',
  client_import: 'una importación de contactos',
  property_import: 'una importación de propiedades',
  favorite_search: 'una búsqueda favorita',
  location: 'una ubicación',
  feature: 'una característica',
  custom_attribute: 'un atributo propio',
};

/** Las exportaciones de un listado (Excel, PDF masivos): la misma acción que la de una ficha. */
const EXPORT_LABELS: Readonly<Record<string, string>> = {
  property_export: 'exportó propiedades',
  client_export: 'exportó contactos',
  appraisal_export: 'exportó tasaciones',
  reservation_export: 'exportó reservas',
};

/** Qué hizo, en minúscula y sin sujeto ("editó la ficha"): la UI le pone mayúscula. */
export function activityActionLabel(entry: ActivityEntryRow): string {
  const label = EXPORT_LABELS[entry.entityType] ?? ACTION_LABELS[entry.action];
  if (label !== undefined) return label;
  const verb = VERBS[entry.action.split('.').at(-1) ?? ''];
  const noun = NOUNS[entry.entityType] ?? 'un registro';
  return verb === undefined ? `hizo un cambio en ${noun}` : `${verb} ${noun}`;
}

const FORMATS: Readonly<Partial<Record<string, HistoryFormat>>> = {
  property: {
    actionLabels: HISTORY_ACTION_LABELS,
    fieldLabel: historyFieldLabel,
    formatValue: formatHistoryValue,
  },
  client: {
    actionLabels: CLIENT_HISTORY_ACTION_LABELS,
    fieldLabel: clientHistoryFieldLabel,
    formatValue: formatClientHistoryValue,
  },
  development: {
    actionLabels: DEVELOPMENT_HISTORY_ACTION_LABELS,
    fieldLabel: developmentFieldLabel,
    formatValue: formatDevelopmentValue,
  },
  appraisal: {
    actionLabels: APPRAISAL_HISTORY_ACTION_LABELS,
    fieldLabel: appraisalFieldLabel,
    formatValue: formatAppraisalValue,
  },
};

/**
 * Cómo mostrar el diff: solo de las entidades con historial en su ficha, que saben nombrar sus
 * campos. Las exportaciones guardan cómo se pidieron (formato, IDs), no cambios: no se muestran.
 */
export function activityFormat(entry: ActivityEntryRow): HistoryFormat | undefined {
  if (/[._]export(ed)?$/.test(entry.action)) return undefined;
  return FORMATS[entry.entityType];
}

/** La ficha donde se ve la entidad, si tiene una. */
export function activityHref(entry: ActivityEntryRow): Route | undefined {
  const path = fichaPath(entry);
  // typedRoutes no verifica un segmento dinámico armado.
  return path === undefined ? undefined : (path as Route);
}

function fichaPath(entry: ActivityEntryRow): string | undefined {
  switch (entry.entityType) {
    case 'property':
      return `/propiedades/${entry.entityId}`;
    case 'development':
      return `/emprendimientos/${entry.entityId}`;
    case 'client':
      return `/contactos/${entry.entityId}`;
    case 'appraisal':
      return `/tasaciones/${entry.entityId}`;
    case 'opportunity':
      return entry.entity?.clientId === undefined
        ? undefined
        : `/contactos/${entry.entity.clientId}`;
    default:
      return undefined;
  }
}
