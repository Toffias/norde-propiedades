import { z } from 'zod';

import { pageQuerySchema } from '../../shared/contracts';

import type { PropertyStatusValue } from './values';

// ---------- Excel de unidades de un emprendimiento ----------

export const ExportDevelopmentUnitsInputSchema = z.object({ developmentId: z.uuid() });
export type ExportDevelopmentUnitsInput = z.input<typeof ExportDevelopmentUnitsInputSchema>;

/** Los estados en la planilla: la exportación los escribe así y la importación los reconoce. */
export const UNIT_STATUS_LABELS: Readonly<Record<PropertyStatusValue, string>> = {
  draft: 'Borrador',
  available: 'Disponible',
  reserved: 'Reservada',
  sold: 'Vendida',
  rented: 'Alquilada',
  paused: 'Pausada',
  withdrawn: 'Dada de baja',
};

/** Una operación sin precio sale así en la planilla ("precio a consultar"). */
export const UNIT_PRICE_ON_REQUEST_LABEL = 'Consultar';

export const UNIT_IMPORT_FIELD_VALUES = [
  'floor',
  'unit',
  'propertyType',
  'rooms',
  'surfaceTotalM2',
  'surfaceCoveredM2',
  'saleCurrency',
  'salePrice',
  'rentCurrency',
  'rentPrice',
  'temporaryRentCurrency',
  'temporaryRentPrice',
  'status',
] as const;
export type UnitImportFieldValue = (typeof UNIT_IMPORT_FIELD_VALUES)[number];

/** Los encabezados de la exportación: un Excel exportado se vuelve a importar sin tocar el mapeo. */
export const UNIT_IMPORT_FIELD_LABELS: Readonly<Record<UnitImportFieldValue, string>> = {
  floor: 'Piso',
  unit: 'Unidad',
  propertyType: 'Tipo',
  rooms: 'Ambientes',
  surfaceTotalM2: 'Sup. total (m²)',
  surfaceCoveredM2: 'Sup. cubierta (m²)',
  saleCurrency: 'Venta: moneda',
  salePrice: 'Venta: precio',
  rentCurrency: 'Alquiler: moneda',
  rentPrice: 'Alquiler: precio',
  temporaryRentCurrency: 'Temporario: moneda',
  temporaryRentPrice: 'Temporario: precio',
  status: 'Estado',
};

export const UNIT_IMPORT_STATUS_VALUES = ['pending', 'running', 'done', 'failed'] as const;
export type UnitImportStatusValue = (typeof UNIT_IMPORT_STATUS_VALUES)[number];

/** Una pendiente todavía no la tomó el job: para quien mira, ya está en proceso. */
export const UNIT_IMPORT_STATUS_LABELS: Readonly<Record<UnitImportStatusValue, string>> = {
  pending: 'En proceso',
  running: 'En proceso',
  done: 'Listo',
  failed: 'Error',
};

export const UNIT_IMPORT_FAILURE_VALUES = [
  'file_missing',
  'unreadable_file',
  'too_many_rows',
  'development_unavailable',
] as const;
export type UnitImportFailureValue = (typeof UNIT_IMPORT_FAILURE_VALUES)[number];

export const UNIT_IMPORT_FAILURE_LABELS: Readonly<Record<UnitImportFailureValue, string>> = {
  file_missing: 'No se encontró el archivo subido.',
  unreadable_file: 'No se pudo leer el archivo como Excel.',
  too_many_rows: 'El archivo tiene más filas de las que se pueden importar.',
  development_unavailable: 'El emprendimiento se borró antes de procesar el archivo.',
};

export const UNIT_IMPORT_PROBLEM_CODE_VALUES = [
  'missing_unit',
  'ambiguous_unit',
  'unit_in_trash',
  'missing_type',
  'type_disabled',
  'missing_operation',
  'missing_currency',
  'invalid_value',
  'invalid_status',
  'status_forbidden',
  'code_unavailable',
] as const;
export type UnitImportProblemCodeValue = (typeof UNIT_IMPORT_PROBLEM_CODE_VALUES)[number];

export const UNIT_IMPORT_PROBLEM_LABELS: Readonly<Record<UnitImportProblemCodeValue, string>> = {
  missing_unit: 'No tiene unidad',
  ambiguous_unit: 'Hay más de una unidad con ese piso y unidad',
  unit_in_trash: 'La unidad está en la papelera',
  missing_type: 'Es una unidad nueva y no tiene tipo',
  type_disabled: 'El tipo de propiedad no está habilitado',
  missing_operation: 'Es una unidad nueva y no tiene operación (moneda o precio)',
  missing_currency: 'Una operación nueva no tiene moneda',
  invalid_value: 'Valor inválido',
  invalid_status: 'No puede pasar a ese estado',
  status_forbidden: 'Marcarla disponible requiere un permiso que no tenés',
  code_unavailable: 'No se pudo asignar un código de referencia',
};

export const MAX_UNIT_IMPORT_ROWS = 2000;
export const MAX_UNIT_IMPORT_COLUMNS = 50;
export const MAX_UNIT_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
/** Lo que ofrece el selector de archivos (el caso de uso valida que se pueda leer). */
export const UNIT_IMPORT_ACCEPT = '.xlsx';
/** Filas de muestra de la vista previa. */
export const UNIT_IMPORT_SAMPLE_ROWS = 5;

const ImportFileSchema = {
  developmentId: z.uuid(),
  fileName: z.string().trim().min(1).max(200),
  bytes: z
    .instanceof(Uint8Array)
    .refine((value) => value.byteLength > 0, { message: 'El archivo está vacío.' })
    .refine((value) => value.byteLength <= MAX_UNIT_IMPORT_FILE_BYTES, {
      message: 'El archivo es demasiado grande.',
    }),
};

export const PreviewDevelopmentUnitImportInputSchema = z.object(ImportFileSchema);
export type PreviewDevelopmentUnitImportInput = z.input<
  typeof PreviewDevelopmentUnitImportInputSchema
>;

/** Qué columna (desde 0) se lee para cada dato. */
export const UnitImportMappingSchema = z.partialRecord(
  z.enum(UNIT_IMPORT_FIELD_VALUES),
  z
    .int()
    .min(0)
    .max(MAX_UNIT_IMPORT_COLUMNS - 1),
);
export type UnitImportMappingInput = z.input<typeof UnitImportMappingSchema>;

export const StartDevelopmentUnitImportInputSchema = z.object({
  ...ImportFileSchema,
  mapping: UnitImportMappingSchema,
});
export type StartDevelopmentUnitImportInput = z.input<typeof StartDevelopmentUnitImportInputSchema>;

export interface DevelopmentUnitImportPreview {
  readonly headers: readonly string[];
  /** Las primeras filas, para revisar el mapeo. */
  readonly sample: readonly (readonly (string | null)[])[];
  readonly rowCount: number;
  readonly suggestedMapping: Readonly<Partial<Record<UnitImportFieldValue, number>>>;
}

export interface StartDevelopmentUnitImportOutput {
  readonly importId: string;
}

export const ListDevelopmentUnitImportsQuerySchema = pageQuerySchema({
  sortable: ['createdAt'],
  defaultSort: { field: 'createdAt', direction: 'desc' },
}).extend({ developmentId: z.uuid() });
export type ListDevelopmentUnitImportsQuery = z.input<typeof ListDevelopmentUnitImportsQuerySchema>;

export const ListDevelopmentUnitImportProblemsQuerySchema = pageQuerySchema({
  sortable: ['rowNumber'],
  defaultSort: { field: 'rowNumber', direction: 'asc' },
}).extend({ developmentId: z.uuid(), importId: z.uuid() });
export type ListDevelopmentUnitImportProblemsQuery = z.input<
  typeof ListDevelopmentUnitImportProblemsQuerySchema
>;

export interface DevelopmentUnitImportTotalsRow {
  readonly rows: number;
  readonly processed: number;
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly failed: number;
}

export interface DevelopmentUnitImportRow {
  readonly id: string;
  readonly fileName: string;
  readonly status: UnitImportStatusValue;
  readonly totals: DevelopmentUnitImportTotalsRow;
  readonly failure: UnitImportFailureValue | undefined;
  readonly requestedBy: { readonly id: string; readonly name: string | undefined } | undefined;
  readonly createdAt: Date;
  readonly startedAt: Date | undefined;
  readonly finishedAt: Date | undefined;
}

/** Una fila que no se importó: el número de fila, el dato con problemas y la unidad si se encontró. */
export interface DevelopmentUnitImportProblemRow {
  readonly rowNumber: number;
  readonly code: UnitImportProblemCodeValue;
  readonly field: UnitImportFieldValue | undefined;
  readonly propertyId: string | undefined;
}
