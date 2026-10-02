import { Email, err, ok, Phone, type Result } from '../../shared';
import {
  CLIENT_KIND_LABELS,
  CLIENT_KIND_VALUES,
  CLIENT_TYPE_LABELS,
  CLIENT_TYPE_VALUES,
  ClientProfileInputSchema,
  type ClientKindValue,
  type ClientTypeValue,
} from '../contracts';
import type { ClientEmail, ClientPhone } from '../domain/client';
import type { ImportField, ImportMapping, ImportRowProblem } from '../domain/client-import';
import { normalizeName } from '../domain/duplicate-check';

import { toProfile } from './client-support';
import type { NewClientData } from './client-creation';

export type ImportedClient = Omit<
  NewClientData,
  'id' | 'agentId' | 'branchId' | 'now' | 'phones' | 'emails'
> & {
  readonly phones: readonly ClientPhone[];
  readonly emails: readonly ClientEmail[];
};

export type RowProblem = Omit<ImportRowProblem, 'rowNumber' | 'clientId'>;

const MAX_NAME_LENGTH = 120;

const PHONE_COLUMNS: readonly (readonly [ImportField, ClientPhone['kind']])[] = [
  ['phone', 'main'],
  ['mobile', 'mobile'],
  ['workPhone', 'work'],
];
const EMAIL_COLUMNS: readonly (readonly [ImportField, ClientEmail['kind']])[] = [
  ['email', 'main'],
  ['secondaryEmail', 'other'],
];
const PROFILE_COLUMNS = [
  'companyName',
  'jobTitle',
  'website',
  'address',
  'country',
  'documentNumber',
] as const;

/** Un valor por su texto en español o su clave, sin mayúsculas ni acentos. */
function byLabel<T extends string>(
  values: readonly T[],
  labels: Readonly<Record<T, string>>,
  raw: string,
): T | undefined {
  const key = normalizeName(raw);
  return values.find((v) => normalizeName(labels[v]) === key || normalizeName(v) === key);
}

/** `AAAA-MM-DD` o `DD/MM/AAAA` (también con guiones) → `AAAA-MM-DD`. */
function isoDate(raw: string): string | undefined {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const local = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : local
      ? [Number(local[3]), Number(local[2]), Number(local[1])]
      : [0, 0, 0];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > (daysInMonth[month - 1] ?? 0)) {
    return undefined;
  }
  return `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const problem = (code: RowProblem['code'], field?: ImportField): RowProblem => ({
  code,
  field,
});

/**
 * Una fila del Excel como alta de contacto, con el mapeo elegido. Sin nombre se usa la empresa
 * (y queda como empresa); los tipos de cliente van separados por coma.
 */
export function readImportRow(
  cells: readonly (string | undefined)[],
  mapping: ImportMapping,
): Result<ImportedClient, RowProblem> {
  const value = (field: ImportField): string | undefined => {
    const column = mapping[field];
    const raw = column === undefined ? undefined : cells[column]?.trim();
    return raw === '' ? undefined : raw;
  };

  const ownName = value('name');
  const companyName = value('companyName');
  const name = ownName ?? companyName;
  if (name === undefined) return err(problem('missing_name'));
  if (name.length > MAX_NAME_LENGTH) {
    return err(problem('invalid_value', ownName === undefined ? 'companyName' : 'name'));
  }

  const rawKind = value('kind');
  let kind: ClientKindValue = ownName === undefined ? 'company' : 'person';
  if (rawKind !== undefined) {
    const parsed = byLabel(CLIENT_KIND_VALUES, CLIENT_KIND_LABELS, rawKind);
    if (parsed === undefined) return err(problem('invalid_value', 'kind'));
    kind = parsed;
  }

  const phones: ClientPhone[] = [];
  for (const [field, phoneKind] of PHONE_COLUMNS) {
    const raw = value(field);
    if (raw === undefined) continue;
    const phone = Phone.create(raw);
    if (phone.isErr()) return err(problem('invalid_phone', field));
    phones.push({ kind: phoneKind, phone: phone.value, contactHours: undefined });
  }
  const emails: ClientEmail[] = [];
  for (const [field, emailKind] of EMAIL_COLUMNS) {
    const raw = value(field);
    if (raw === undefined) continue;
    const email = Email.create(raw);
    if (email.isErr()) return err(problem('invalid_email', field));
    emails.push({ kind: emailKind, email: email.value });
  }
  if (phones.length === 0 && emails.length === 0) return err(problem('missing_contact'));

  const clientTypes: ClientTypeValue[] = [];
  for (const raw of (value('clientTypes') ?? '').split(/[,;]/)) {
    if (raw.trim() === '') continue;
    const type = byLabel(CLIENT_TYPE_VALUES, CLIENT_TYPE_LABELS, raw);
    if (type === undefined) return err(problem('invalid_value', 'clientTypes'));
    clientTypes.push(type);
  }

  const rawBirthDate = value('birthDate');
  const birthDate = rawBirthDate === undefined ? undefined : isoDate(rawBirthDate);
  if (rawBirthDate !== undefined && birthDate === undefined) {
    return err(problem('invalid_value', 'birthDate'));
  }

  const profileInput: Partial<Record<(typeof PROFILE_COLUMNS)[number], string>> = {};
  for (const field of PROFILE_COLUMNS) {
    // El nombre de la empresa no se repite en la ficha si ya es el nombre del contacto.
    if (field === 'companyName' && ownName === undefined) continue;
    const raw = value(field);
    if (raw !== undefined) profileInput[field] = raw;
  }
  const profile = ClientProfileInputSchema.safeParse({ ...profileInput, birthDate });
  if (!profile.success) {
    const field = PROFILE_COLUMNS.find((f) => profile.error.issues.some((i) => i.path[0] === f));
    return err(problem('invalid_value', field));
  }

  return ok({ kind, name, phones, emails, clientTypes, profile: toProfile(profile.data) });
}
