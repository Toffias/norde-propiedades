import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { DomainEvent } from '../../shared/domain/domain-event';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

// Importación de unidades de un emprendimiento desde un Excel: el panel sube el archivo con el
// mapeo de columnas y un job lo procesa fila por fila. Cada fila crea la unidad o actualiza la que
// ya existe con el mismo piso y unidad: importar dos veces el mismo archivo no duplica unidades.

export type DevelopmentUnitImportId = Id<'DevelopmentUnitImport'>;

/** Los datos de la unidad que se pueden leer de una columna. */
export const UNIT_IMPORT_FIELDS = [
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
export type UnitImportField = (typeof UNIT_IMPORT_FIELDS)[number];

/** Qué columna (desde 0) se lee para cada dato. Un dato sin columna no se importa. */
export type UnitImportMapping = Readonly<Partial<Record<UnitImportField, number>>>;

export const MAX_UNIT_IMPORT_ROWS = 2000;
export const MAX_UNIT_IMPORT_COLUMNS = 50;

export const UNIT_IMPORT_STATUSES = ['pending', 'running', 'done', 'failed'] as const;
export type UnitImportStatus = (typeof UNIT_IMPORT_STATUSES)[number];

/** Por qué falló una importación entera (las filas con problemas no la hacen fallar). */
export const UNIT_IMPORT_FAILURES = [
  'file_missing',
  'unreadable_file',
  'too_many_rows',
  'development_unavailable',
] as const;
export type UnitImportFailure = (typeof UNIT_IMPORT_FAILURES)[number];

/** Qué pasó con una fila que no se importó. */
export const UNIT_IMPORT_PROBLEM_CODES = [
  'missing_unit',
  'ambiguous_unit',
  'unit_in_trash',
  'missing_type',
  'type_disabled',
  'missing_operation',
  'missing_currency',
  'invalid_value',
  'invalid_status',
  'unit_reserved',
  'status_forbidden',
  'code_unavailable',
] as const;
export type UnitImportProblemCode = (typeof UNIT_IMPORT_PROBLEM_CODES)[number];

/** `unchanged`: la unidad ya tenía esos datos. */
export type UnitImportRowOutcome = 'created' | 'updated' | 'unchanged' | 'failed';

/** Una fila que no se importó: el número de fila, el dato con problemas y la unidad, si se encontró. */
export interface UnitImportRowProblem {
  readonly rowNumber: number;
  readonly code: UnitImportProblemCode;
  readonly field: UnitImportField | undefined;
  readonly propertyId: string | undefined;
}

export interface UnitImportTotals {
  /** Filas de datos del archivo, sin el encabezado. */
  readonly rows: number;
  readonly processed: number;
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly failed: number;
}

export interface DevelopmentUnitImportSnapshot {
  readonly id: DevelopmentUnitImportId;
  readonly developmentId: string;
  readonly fileName: string;
  readonly storageKey: string;
  readonly status: UnitImportStatus;
  readonly mapping: UnitImportMapping;
  /**
   * Si quien importó puede marcar unidades como disponibles (`properties:mark-available`): el job
   * corre como sistema y respeta los permisos de quien lo pidió.
   */
  readonly canMarkAvailable: boolean;
  readonly totals: UnitImportTotals;
  readonly failure: UnitImportFailure | undefined;
  readonly requestedBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly startedAt: Date | undefined;
  readonly finishedAt: Date | undefined;
}

export interface InvalidUnitImportMappingError {
  readonly type: 'InvalidUnitImportMapping';
  readonly reason: 'missing_unit' | 'unknown_column' | 'repeated_column';
}

export interface EmptyUnitImportFileError {
  readonly type: 'EmptyImportFile';
}

export interface TooManyUnitImportRowsError {
  readonly type: 'TooManyImportRows';
  readonly max: number;
}

export interface UnitImportFinishedError {
  readonly type: 'ImportFinished';
}

/** Se pidió una importación de unidades: la procesa un job (pg-boss). */
export type DevelopmentUnitImportRequested = DomainEvent<
  'properties.unit_import_requested',
  { readonly importId: string; readonly developmentId: string }
>;

/** El mapeo sirve si tiene de dónde sacar la unidad y cada columna existe y se usa una sola vez. */
export function validateUnitImportMapping(
  mapping: UnitImportMapping,
  columnCount: number,
): Result<void, InvalidUnitImportMappingError> {
  const columns = UNIT_IMPORT_FIELDS.map((field) => mapping[field]).filter(
    (column) => column !== undefined,
  );
  if (columns.some((c) => !Number.isInteger(c) || c < 0 || c >= columnCount)) {
    return err({ type: 'InvalidUnitImportMapping', reason: 'unknown_column' });
  }
  if (new Set(columns).size !== columns.length) {
    return err({ type: 'InvalidUnitImportMapping', reason: 'repeated_column' });
  }
  if (mapping.unit === undefined) {
    return err({ type: 'InvalidUnitImportMapping', reason: 'missing_unit' });
  }
  return ok(undefined);
}

/** Cuántas filas puede tener el archivo: al menos una, como mucho `MAX_UNIT_IMPORT_ROWS`. */
export function checkUnitImportRows(
  rows: number,
): Result<void, EmptyUnitImportFileError | TooManyUnitImportRowsError> {
  if (rows === 0) return err({ type: 'EmptyImportFile' });
  if (rows > MAX_UNIT_IMPORT_ROWS) {
    return err({ type: 'TooManyImportRows', max: MAX_UNIT_IMPORT_ROWS });
  }
  return ok(undefined);
}

/** Un encabezado sin mayúsculas, acentos ni espacios de más; "m²" cuenta como "m2". */
function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/²/g, '2')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Encabezados que se reconocen solos: los de la exportación de unidades y los habituales de una
 * lista de precios, sin mayúsculas ni acentos.
 */
const HEADER_SYNONYMS: Readonly<Record<UnitImportField, readonly string[]>> = {
  floor: ['piso', 'nivel'],
  unit: ['unidad', 'depto', 'depto.', 'dpto', 'dpto.', 'departamento', 'uf', 'lote'],
  propertyType: ['tipo', 'tipo de propiedad'],
  rooms: ['ambientes', 'amb', 'amb.', 'cantidad de ambientes'],
  surfaceTotalM2: ['sup. total (m2)', 'sup. total', 'superficie total', 'm2 totales'],
  surfaceCoveredM2: ['sup. cubierta (m2)', 'sup. cubierta', 'superficie cubierta', 'm2 cubiertos'],
  saleCurrency: ['venta: moneda', 'moneda'],
  salePrice: ['venta: precio', 'precio', 'precio de venta', 'valor'],
  rentCurrency: ['alquiler: moneda'],
  rentPrice: ['alquiler: precio', 'precio de alquiler'],
  temporaryRentCurrency: ['temporario: moneda'],
  temporaryRentPrice: ['temporario: precio'],
  status: ['estado', 'disponibilidad'],
};

/** El mapeo que se propone a partir de los encabezados; quien importa lo revisa. */
export function suggestUnitImportMapping(headers: readonly string[]): UnitImportMapping {
  const normalized = headers.map(normalizeHeader);
  const mapping: Partial<Record<UnitImportField, number>> = {};
  const used = new Set<number>();
  for (const field of UNIT_IMPORT_FIELDS) {
    const column = normalized.findIndex(
      (header, index) => !used.has(index) && HEADER_SYNONYMS[field].includes(header),
    );
    if (column === -1) continue;
    mapping[field] = column;
    used.add(column);
  }
  return mapping;
}

/**
 * Piso o unidad tal como se comparan: en mayúsculas, sin acentos, espacios, puntos ni "°". Así
 * "4° A", "4 a" y "4A" son la misma unidad. La consulta del repositorio aplica la misma regla.
 */
export function normalizeUnitDesignation(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[\s.°º]/g, '')
    .toUpperCase();
}

/** Piso y unidad de una unidad del emprendimiento, normalizados: la clave de la importación. */
export interface UnitDesignation {
  readonly floor: string;
  readonly unit: string;
}

export function unitDesignation(floor: string | undefined, unit: string): UnitDesignation {
  return { floor: normalizeUnitDesignation(floor), unit: normalizeUnitDesignation(unit) };
}

const NO_TOTALS: Omit<UnitImportTotals, 'rows'> = {
  processed: 0,
  created: 0,
  updated: 0,
  unchanged: 0,
  failed: 0,
};

/**
 * Una importación de unidades. Nace pendiente; el job la pone en proceso, suma cada fila y la
 * termina (o la marca fallida si no pudo leer el archivo). Si el job se corta, retoma desde la
 * última fila procesada.
 */
export class DevelopmentUnitImport extends AggregateRoot<
  DevelopmentUnitImportId,
  DevelopmentUnitImportRequested
> {
  #state: Omit<DevelopmentUnitImportSnapshot, 'id'>;

  private constructor(
    id: DevelopmentUnitImportId,
    state: Omit<DevelopmentUnitImportSnapshot, 'id'>,
  ) {
    super(id);
    this.#state = state;
  }

  static request(input: {
    readonly id: DevelopmentUnitImportId;
    readonly developmentId: string;
    readonly fileName: string;
    readonly storageKey: string;
    readonly mapping: UnitImportMapping;
    readonly columnCount: number;
    readonly rows: number;
    readonly canMarkAvailable: boolean;
    readonly requestedBy: string;
    readonly now: Date;
  }): Result<
    DevelopmentUnitImport,
    InvalidUnitImportMappingError | EmptyUnitImportFileError | TooManyUnitImportRowsError
  > {
    const rows = checkUnitImportRows(input.rows);
    if (rows.isErr()) return err(rows.error);
    const mapping = validateUnitImportMapping(input.mapping, input.columnCount);
    if (mapping.isErr()) return err(mapping.error);

    const job = new DevelopmentUnitImport(input.id, {
      developmentId: input.developmentId,
      fileName: input.fileName,
      storageKey: input.storageKey,
      status: 'pending',
      mapping: input.mapping,
      canMarkAvailable: input.canMarkAvailable,
      totals: { rows: input.rows, ...NO_TOTALS },
      failure: undefined,
      requestedBy: input.requestedBy,
      createdAt: input.now,
      updatedAt: input.now,
      startedAt: undefined,
      finishedAt: undefined,
    });
    job.record({
      type: 'properties.unit_import_requested',
      aggregateId: input.id,
      occurredAt: input.now,
      payload: { importId: input.id, developmentId: input.developmentId },
    });
    return ok(job);
  }

  static restore(snapshot: DevelopmentUnitImportSnapshot): DevelopmentUnitImport {
    const { id, ...state } = snapshot;
    return new DevelopmentUnitImport(id, state);
  }

  get developmentId(): string {
    return this.#state.developmentId;
  }

  get status(): UnitImportStatus {
    return this.#state.status;
  }

  get storageKey(): string {
    return this.#state.storageKey;
  }

  get mapping(): UnitImportMapping {
    return this.#state.mapping;
  }

  get canMarkAvailable(): boolean {
    return this.#state.canMarkAvailable;
  }

  get totals(): UnitImportTotals {
    return this.#state.totals;
  }

  get isFinished(): boolean {
    return this.#state.status === 'done' || this.#state.status === 'failed';
  }

  /** Las filas ya procesadas se saltean al retomar. */
  wasProcessed(rowIndex: number): boolean {
    return rowIndex < this.#state.totals.processed;
  }

  /** La pone en proceso. Una que quedó en proceso (el job se cortó) se retoma. */
  start(now: Date): Result<void, UnitImportFinishedError> {
    if (this.isFinished) return err({ type: 'ImportFinished' });
    if (this.#state.status === 'pending') {
      this.#state = { ...this.#state, status: 'running', startedAt: now, updatedAt: now };
    }
    return ok(undefined);
  }

  /** Suma una fila procesada. */
  recordRow(outcome: UnitImportRowOutcome, now: Date): void {
    const t = this.#state.totals;
    const add = (kind: UnitImportRowOutcome) => (outcome === kind ? 1 : 0);
    this.#state = {
      ...this.#state,
      totals: {
        ...t,
        processed: t.processed + 1,
        created: t.created + add('created'),
        updated: t.updated + add('updated'),
        unchanged: t.unchanged + add('unchanged'),
        failed: t.failed + add('failed'),
      },
      updatedAt: now,
    };
  }

  /** Terminó: las filas que leyó el job son las del archivo. */
  finish(now: Date): void {
    this.#state = {
      ...this.#state,
      status: 'done',
      totals: { ...this.#state.totals, rows: this.#state.totals.processed },
      finishedAt: now,
      updatedAt: now,
    };
  }

  fail(failure: UnitImportFailure, now: Date): void {
    this.#state = { ...this.#state, status: 'failed', failure, finishedAt: now, updatedAt: now };
  }

  toSnapshot(): DevelopmentUnitImportSnapshot {
    return { id: this.id, ...this.#state };
  }
}
