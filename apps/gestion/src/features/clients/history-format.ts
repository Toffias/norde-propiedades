import type { HistoryValue } from '@norde/core/audit/contracts';
import {
  CLIENT_KIND_LABELS,
  CLIENT_TYPE_LABELS,
  DOCUMENT_TYPE_LABELS,
  EMAIL_KIND_LABELS,
  PHONE_KIND_LABELS,
} from '@norde/core/clients/contracts';

import { EMPTY_VALUE, formatDateOnly } from '../../lib/format';
import { formatPhone } from './client-format';

// El historial guarda valores crudos (E.164, IDs, enums): acá se pasan a texto para mostrarlos.

export const CLIENT_HISTORY_ACTION_LABELS: Readonly<Record<string, string>> = {
  'client.created': 'dio de alta el contacto',
  'client.registered': 'registró el contacto',
  'client.contact_recorded': 'registró un nuevo contacto por un canal',
  'client.updated': 'editó el contacto',
  'client.reassigned': 'cambió el agente',
  'client.deleted': 'mandó el contacto a la papelera',
  'client.restored': 'restauró el contacto',
  'client.tags_changed': 'cambió las etiquetas',
  'client.linked': 'agregó un contacto relacionado',
  'client.relation_updated': 'cambió una relación',
  'client.unlinked': 'quitó un contacto relacionado',
  'client.note_added': 'agregó una nota',
  'client.listings_featured': 'le destacó propiedades',
  'client.listing_unfeatured': 'le quitó una propiedad destacada',
  'client.merged': 'unificó otro contacto en este',
  'client.merged_into': 'unificó este contacto en otro',
};

const FIELD_LABELS: Readonly<Record<string, string>> = {
  kind: 'Tipo de registro',
  name: 'Nombre',
  phones: 'Teléfonos',
  emails: 'Emails',
  clientTypes: 'Tipos de cliente',
  agentId: 'Agente',
  branchId: 'Sucursal',
  companyName: 'Empresa',
  jobTitle: 'Cargo',
  website: 'Web',
  birthDate: 'Fecha de nacimiento',
  address: 'Dirección',
  country: 'País',
  language: 'Idioma',
  documentType: 'Tipo de documento',
  documentNumber: 'Número de documento',
  tagIds: 'Etiquetas',
  relations: 'Contactos relacionados',
  relatedClientId: 'Contacto',
  relationKind: 'Relación',
  relationLabel: 'Detalle',
  mergedClientId: 'Contacto unificado',
  mergedIntoId: 'Unificado en',
  note: 'Nota',
  propertyIds: 'Propiedades',
  propertyId: 'Propiedad',
  'moved.opportunities': 'Oportunidades que pasaron',
  'moved.activities': 'Actividades que pasaron',
  'moved.savedSearches': 'Búsquedas que pasaron',
  'moved.featuredListings': 'Destacadas que pasaron',
  'moved.sharedListings': 'Envíos que pasaron',
  'moved.inquiries': 'Consultas que pasaron',
  'moved.incomingRelations': 'Relaciones que pasaron',
};

const RELATION_KIND_LABELS: Readonly<Record<string, string>> = {
  works_at: 'Trabaja en',
  member_of: 'Es miembro de',
  related: 'Relacionado',
};

function count(total: number, one: string, many: string): string {
  return `${total.toLocaleString('es-AR')} ${total === 1 ? one : many}`;
}

export function clientHistoryFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

// `Array.isArray` no angosta las listas `readonly`.
function isList(value: HistoryValue): value is readonly HistoryValue[] {
  return Array.isArray(value);
}

function text(value: HistoryValue | undefined): string {
  return typeof value === 'string' ? value : '';
}

function label(labels: Readonly<Record<string, string>>, value: HistoryValue | undefined): string {
  const raw = text(value);
  return labels[raw] ?? raw;
}

function entry(
  value: HistoryValue,
  render: (item: Readonly<Record<string, HistoryValue>>) => string,
) {
  return typeof value === 'object' && value !== null && !isList(value) ? render(value) : '';
}

/** Un valor del historial como texto: "Celular +54 9 11 6689-9124 (de 9 a 13)". */
export function formatClientHistoryValue(field: string, value: HistoryValue): string {
  if (value === null || value === '') return EMPTY_VALUE;
  switch (field) {
    case 'phones':
      return isList(value)
        ? value
            .map((item) =>
              entry(item, (phone) => {
                const hours = text(phone.contactHours);
                return `${label(PHONE_KIND_LABELS, phone.kind)} ${formatPhone(text(phone.number))}${hours === '' ? '' : ` (${hours})`}`;
              }),
            )
            .join(', ')
        : EMPTY_VALUE;
    case 'emails':
      return isList(value)
        ? value
            .map((item) =>
              entry(
                item,
                (email) => `${label(EMAIL_KIND_LABELS, email.kind)} ${text(email.address)}`,
              ),
            )
            .join(', ')
        : EMPTY_VALUE;
    case 'clientTypes':
      return isList(value)
        ? value.map((type) => label(CLIENT_TYPE_LABELS, type)).join(', ')
        : EMPTY_VALUE;
    case 'kind':
      return label(CLIENT_KIND_LABELS, value);
    case 'documentType':
      return label(DOCUMENT_TYPE_LABELS, value);
    case 'birthDate':
      return formatDateOnly(text(value));
    // El historial guarda el agente y la sucursal por ID: se indica que cambió.
    case 'agentId':
      return 'un agente';
    case 'branchId':
      return 'una sucursal';
    // Otros contactos y las etiquetas también van por ID.
    case 'relatedClientId':
    case 'mergedClientId':
    case 'mergedIntoId':
      return 'otro contacto';
    case 'tagIds':
      return isList(value) ? count(value.length, 'etiqueta', 'etiquetas') : EMPTY_VALUE;
    case 'relations':
      return isList(value)
        ? value
            .map((item) => entry(item, (relation) => label(RELATION_KIND_LABELS, relation.kind)))
            .join(', ')
        : EMPTY_VALUE;
    case 'relationKind':
      return label(RELATION_KIND_LABELS, value);
    // Las propiedades son de otro módulo: van por ID.
    case 'propertyIds':
      return isList(value) ? count(value.length, 'propiedad', 'propiedades') : EMPTY_VALUE;
    case 'propertyId':
      return 'una propiedad';
    default:
      return typeof value === 'string' || typeof value === 'number' ? String(value) : EMPTY_VALUE;
  }
}
