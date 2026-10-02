import { z } from 'zod';

import { pageQuerySchema } from '../../shared/contracts';

import type { ClientUserRef } from './clients-panel';

// ---------- Importación desde Excel ----------

export const IMPORT_FIELD_VALUES = [
  'name',
  'kind',
  'companyName',
  'phone',
  'mobile',
  'workPhone',
  'email',
  'secondaryEmail',
  'clientTypes',
  'jobTitle',
  'website',
  'address',
  'country',
  'documentNumber',
  'birthDate',
] as const;
export type ImportFieldValue = (typeof IMPORT_FIELD_VALUES)[number];

export const IMPORT_FIELD_LABELS: Readonly<Record<ImportFieldValue, string>> = {
  name: 'Nombre',
  kind: 'Tipo de registro',
  companyName: 'Empresa',
  phone: 'Teléfono',
  mobile: 'Celular',
  workPhone: 'Teléfono laboral',
  email: 'Email',
  secondaryEmail: 'Otro email',
  clientTypes: 'Tipos de cliente',
  jobTitle: 'Cargo',
  website: 'Web',
  address: 'Dirección',
  country: 'País',
  documentNumber: 'Número de documento',
  birthDate: 'Fecha de nacimiento',
};

export const CLIENT_IMPORT_STATUS_VALUES = ['pending', 'running', 'done', 'failed'] as const;
export type ClientImportStatusValue = (typeof CLIENT_IMPORT_STATUS_VALUES)[number];

/** Una pendiente todavía no la tomó el job: para quien mira, ya está en proceso. */
export const CLIENT_IMPORT_STATUS_LABELS: Readonly<Record<ClientImportStatusValue, string>> = {
  pending: 'En proceso',
  running: 'En proceso',
  done: 'Listo',
  failed: 'Error',
};

export const CLIENT_IMPORT_FAILURE_VALUES = [
  'file_missing',
  'unreadable_file',
  'too_many_rows',
] as const;
export type ClientImportFailureValue = (typeof CLIENT_IMPORT_FAILURE_VALUES)[number];

export const CLIENT_IMPORT_FAILURE_LABELS: Readonly<Record<ClientImportFailureValue, string>> = {
  file_missing: 'No se encontró el archivo subido.',
  unreadable_file: 'No se pudo leer el archivo como Excel.',
  too_many_rows: 'El archivo tiene más filas de las que se pueden importar.',
};

export const IMPORT_PROBLEM_CODE_VALUES = [
  'duplicate',
  'missing_name',
  'missing_contact',
  'invalid_phone',
  'invalid_email',
  'invalid_value',
] as const;
export type ImportProblemCodeValue = (typeof IMPORT_PROBLEM_CODE_VALUES)[number];

export const IMPORT_PROBLEM_LABELS: Readonly<Record<ImportProblemCodeValue, string>> = {
  duplicate: 'Ya existe un contacto con ese teléfono o email',
  missing_name: 'No tiene nombre ni empresa',
  missing_contact: 'No tiene teléfono ni email',
  invalid_phone: 'Teléfono inválido',
  invalid_email: 'Email inválido',
  invalid_value: 'Valor inválido',
};

export const MAX_CLIENT_IMPORT_ROWS = 10_000;
export const MAX_CLIENT_IMPORT_COLUMNS = 100;
export const MAX_CLIENT_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
/** Lo que ofrece el selector de archivos (el caso de uso valida que se pueda leer). */
export const CLIENT_IMPORT_ACCEPT = '.xlsx';
/** Filas de muestra de la vista previa. */
export const CLIENT_IMPORT_SAMPLE_ROWS = 5;

const ImportFileSchema = {
  fileName: z.string().trim().min(1).max(200),
  bytes: z
    .instanceof(Uint8Array)
    .refine((value) => value.byteLength > 0, { message: 'El archivo está vacío.' })
    .refine((value) => value.byteLength <= MAX_CLIENT_IMPORT_FILE_BYTES, {
      message: 'El archivo es demasiado grande.',
    }),
};

export const PreviewClientImportInputSchema = z.object(ImportFileSchema);
export type PreviewClientImportInput = z.input<typeof PreviewClientImportInputSchema>;

/** Qué columna (desde 0) se lee para cada dato. */
export const ImportMappingSchema = z.partialRecord(
  z.enum(IMPORT_FIELD_VALUES),
  z
    .int()
    .min(0)
    .max(MAX_CLIENT_IMPORT_COLUMNS - 1),
);
export type ImportMappingInput = z.input<typeof ImportMappingSchema>;

export const StartClientImportInputSchema = z.object({
  ...ImportFileSchema,
  mapping: ImportMappingSchema,
  /** Agente a cargo de los contactos importados. Sin elegir, quien importa. */
  agentId: z.uuid().optional(),
});
export type StartClientImportInput = z.input<typeof StartClientImportInputSchema>;

export interface ClientImportPreview {
  readonly headers: readonly string[];
  /** Las primeras filas, para revisar el mapeo. */
  readonly sample: readonly (readonly (string | null)[])[];
  readonly rowCount: number;
  readonly suggestedMapping: Readonly<Partial<Record<ImportFieldValue, number>>>;
}

export interface StartClientImportOutput {
  readonly importId: string;
}

export const ListClientImportsQuerySchema = pageQuerySchema({
  sortable: ['createdAt'],
  defaultSort: { field: 'createdAt', direction: 'desc' },
});
export type ListClientImportsQuery = z.input<typeof ListClientImportsQuerySchema>;

export const ClientImportIdInputSchema = z.object({ importId: z.uuid() });
export type ClientImportIdInput = z.input<typeof ClientImportIdInputSchema>;

export const ListClientImportProblemsQuerySchema = pageQuerySchema({
  sortable: ['rowNumber'],
  defaultSort: { field: 'rowNumber', direction: 'asc' },
}).extend({ importId: z.uuid() });
export type ListClientImportProblemsQuery = z.input<typeof ListClientImportProblemsQuerySchema>;

export interface ClientImportTotalsRow {
  readonly rows: number;
  readonly processed: number;
  readonly created: number;
  readonly duplicates: number;
  readonly failed: number;
}

export interface ClientImportRow {
  readonly id: string;
  readonly fileName: string;
  readonly status: ClientImportStatusValue;
  readonly totals: ClientImportTotalsRow;
  readonly failure: ClientImportFailureValue | undefined;
  readonly requestedBy: ClientUserRef | undefined;
  readonly agent: ClientUserRef | undefined;
  readonly createdAt: Date;
  readonly startedAt: Date | undefined;
  readonly finishedAt: Date | undefined;
}

/** Una fila que no se importó, sin datos personales. */
export interface ClientImportProblemRow {
  readonly rowNumber: number;
  readonly code: ImportProblemCodeValue;
  readonly field: ImportFieldValue | undefined;
  /** El contacto que ya existía (si es un duplicado). */
  readonly clientId: string | undefined;
}
