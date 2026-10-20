import { z } from 'zod';

import { pageQuerySchema } from '../../shared/contracts';

// ---------- Importación de propiedades de Tokko (#17) ----------

/** Replica `PROPERTY_IMPORT_FIELDS` del dominio (un test verifica que coincidan). */
export const PROPERTY_IMPORT_FIELD_VALUES = [
  'code',
  'country',
  'region',
  'neighborhood',
  'address',
  'propertyType',
  'producer',
  'surfaceTotal',
  'surfaceLand',
  'surfaceCovered',
  'surfaceSemiCovered',
  'surfaceUncovered',
  'front',
  'depth',
  'rooms',
  'bedrooms',
  'bathrooms',
  'toilets',
  'parkingSpaces',
  'zoning',
  'floors',
  'age',
  'occupation',
  'expenses',
  'salePrice',
  'rentPrice',
  'temporaryRentPrice',
  'ownerName',
  'ownerEmail',
  'ownerPhone',
  'development',
] as const;
export type PropertyImportFieldValue = (typeof PROPERTY_IMPORT_FIELD_VALUES)[number];

/** El encabezado de Tokko de cada dato: así se nombra en el reporte. */
export const PROPERTY_IMPORT_FIELD_LABELS: Readonly<Record<PropertyImportFieldValue, string>> = {
  code: 'Ref',
  country: 'País',
  region: 'Región',
  neighborhood: 'Barrio',
  address: 'Dirección',
  propertyType: 'Tipo de propiedad',
  producer: 'Productor',
  surfaceTotal: 'Total construido',
  surfaceLand: 'Terreno',
  surfaceCovered: 'Cubierta',
  surfaceSemiCovered: 'Semi-cubierta',
  surfaceUncovered: 'Descubierta',
  front: 'Frente',
  depth: 'Fondo',
  rooms: 'Ambientes',
  bedrooms: 'Dormitorios',
  bathrooms: 'Baños',
  toilets: 'Toilettes',
  parkingSpaces: 'Cocheras',
  zoning: 'Zonificación',
  floors: 'Plantas',
  age: 'Antigüedad',
  occupation: 'Ocupación',
  expenses: 'Expensas',
  salePrice: 'Venta',
  rentPrice: 'Alquiler',
  temporaryRentPrice: 'Alquiler temporario',
  ownerName: 'Propietario',
  ownerEmail: 'Email',
  ownerPhone: 'Celular',
  development: 'Emprendimiento',
};

export const PROPERTY_IMPORT_STATUS_VALUES = ['pending', 'running', 'done', 'failed'] as const;
export type PropertyImportStatusValue = (typeof PROPERTY_IMPORT_STATUS_VALUES)[number];

/** Una pendiente todavía no la tomó el job: para quien mira, ya está en proceso. */
export const PROPERTY_IMPORT_STATUS_LABELS: Readonly<Record<PropertyImportStatusValue, string>> = {
  pending: 'En proceso',
  running: 'En proceso',
  done: 'Listo',
  failed: 'Error',
};

export const PROPERTY_IMPORT_FAILURE_VALUES = [
  'file_missing',
  'unreadable_file',
  'too_many_rows',
] as const;
export type PropertyImportFailureValue = (typeof PROPERTY_IMPORT_FAILURE_VALUES)[number];

export const PROPERTY_IMPORT_FAILURE_LABELS: Readonly<Record<PropertyImportFailureValue, string>> =
  {
    file_missing: 'No se encontró el archivo subido.',
    unreadable_file: 'No se pudo leer el archivo como planilla.',
    too_many_rows: 'El archivo tiene más filas de las que se pueden importar.',
  };

export const PROPERTY_IMPORT_PROBLEM_CODE_VALUES = [
  'already_imported',
  'code_in_trash',
  'invalid_code',
  'missing_address',
  'unknown_type',
  'type_disabled',
  'missing_operation',
  'invalid_value',
  'owner_not_linked',
  'development_not_found',
  'total_surface_dropped',
] as const;
export type PropertyImportProblemCodeValue = (typeof PROPERTY_IMPORT_PROBLEM_CODE_VALUES)[number];

export const PROPERTY_IMPORT_PROBLEM_LABELS: Readonly<
  Record<PropertyImportProblemCodeValue, string>
> = {
  already_imported: 'Ya hay una propiedad con ese código',
  code_in_trash: 'La propiedad con ese código está en la papelera',
  invalid_code: 'Código inválido',
  missing_address: 'No tiene dirección',
  unknown_type: 'Tipo de propiedad desconocido',
  type_disabled: 'El tipo de propiedad no está habilitado',
  missing_operation: 'No tiene precio de venta ni de alquiler',
  invalid_value: 'Valor inválido',
  owner_not_linked: 'Se importó sin propietario: no tiene un teléfono ni un email válidos',
  development_not_found: 'Se importó suelta: no hay un emprendimiento con ese nombre',
  total_surface_dropped:
    'Se importó sin la superficie total: era menor que la cubierta más la semicubierta',
};

/** Los problemas que no impidieron importar la propiedad (replica `PROPERTY_IMPORT_WARNINGS`). */
export const PROPERTY_IMPORT_WARNING_VALUES: readonly PropertyImportProblemCodeValue[] = [
  'owner_not_linked',
  'development_not_found',
  'total_surface_dropped',
];

export const MAX_PROPERTY_IMPORT_ROWS = 2000;
export const MAX_PROPERTY_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
/** La exportación de Tokko es un `.csv`; también se acepta guardada como Excel. */
export const PROPERTY_IMPORT_ACCEPT = '.csv,.xlsx,.xls';

const ImportFileSchema = {
  fileName: z.string().trim().min(1).max(200),
  bytes: z
    .instanceof(Uint8Array)
    .refine((value) => value.byteLength > 0, { message: 'El archivo está vacío.' })
    .refine((value) => value.byteLength <= MAX_PROPERTY_IMPORT_FILE_BYTES, {
      message: 'El archivo es demasiado grande.',
    }),
};

export const PreviewPropertyImportInputSchema = z.object(ImportFileSchema);
export type PreviewPropertyImportInput = z.input<typeof PreviewPropertyImportInputSchema>;

export const StartPropertyImportInputSchema = z.object(ImportFileSchema);
export type StartPropertyImportInput = z.input<typeof StartPropertyImportInputSchema>;

/** Lo que se muestra antes de importar: cuántas filas y qué datos de Tokko se leen. */
export interface PropertyImportPreview {
  readonly rowCount: number;
  /** Los datos que trae el archivo, con su encabezado de Tokko. */
  readonly fields: readonly PropertyImportFieldValue[];
}

export interface StartPropertyImportOutput {
  readonly importId: string;
}

export const ListPropertyImportsQuerySchema = pageQuerySchema({
  sortable: ['createdAt'],
  defaultSort: { field: 'createdAt', direction: 'desc' },
});
export type ListPropertyImportsQuery = z.input<typeof ListPropertyImportsQuerySchema>;

export const PropertyImportIdInputSchema = z.object({ importId: z.uuid() });
export type PropertyImportIdInput = z.input<typeof PropertyImportIdInputSchema>;

export const ListPropertyImportProblemsQuerySchema = pageQuerySchema({
  sortable: ['rowNumber'],
  defaultSort: { field: 'rowNumber', direction: 'asc' },
}).extend({ importId: z.uuid() });
export type ListPropertyImportProblemsQuery = z.input<typeof ListPropertyImportProblemsQuerySchema>;

export interface PropertyImportTotalsRow {
  readonly rows: number;
  readonly processed: number;
  readonly created: number;
  readonly existing: number;
  readonly failed: number;
}

export interface PropertyImportUserRef {
  readonly id: string;
  readonly name: string;
}

export interface PropertyImportRow {
  readonly id: string;
  readonly fileName: string;
  readonly status: PropertyImportStatusValue;
  readonly totals: PropertyImportTotalsRow;
  readonly failure: PropertyImportFailureValue | undefined;
  readonly requestedBy: PropertyImportUserRef | undefined;
  readonly createdAt: Date;
  readonly startedAt: Date | undefined;
  readonly finishedAt: Date | undefined;
}

/** Una fila con problemas, sin datos personales. */
export interface PropertyImportProblemRow {
  readonly rowNumber: number;
  readonly code: PropertyImportProblemCodeValue;
  readonly field: PropertyImportFieldValue | undefined;
  /** La propiedad que se creó o que ya existía. */
  readonly propertyId: string | undefined;
}
