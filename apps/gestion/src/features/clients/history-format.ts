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
};

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
    default:
      return typeof value === 'string' || typeof value === 'number' ? String(value) : EMPTY_VALUE;
  }
}
