import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { DomainEvent } from '../../shared/domain/domain-event';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

// Importación de propiedades desde Tokko (#17), de dos orígenes:
// - La exportación (`.csv`): el panel sube el archivo y un job lo procesa fila por fila. Las
//   columnas son las de Tokko, reconocidas por su encabezado: no hay que elegirlas.
// - La API de Tokko: un job recorre sus propiedades de a páginas. Además de crear las que faltan,
//   completa las que ya están con lo que la exportación no trae (fotos, descripción, coordenadas).
// El "Ref" de Tokko es el código de la propiedad: importar dos veces no duplica propiedades.

export type PropertyImportId = Id<'PropertyImport'>;

/** Los datos de la exportación de Tokko que se leen. */
export const PROPERTY_IMPORT_FIELDS = [
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
export type PropertyImportField = (typeof PROPERTY_IMPORT_FIELDS)[number];

/** El encabezado de cada dato en la exportación de Tokko. */
export const TOKKO_PROPERTY_COLUMNS: Readonly<Record<PropertyImportField, string>> = {
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

/** Sin estas columnas el archivo no es la exportación de propiedades de Tokko. */
export const REQUIRED_TOKKO_COLUMNS: readonly PropertyImportField[] = [
  'code',
  'address',
  'propertyType',
];

/** En qué columna (desde 0) está cada dato. */
export type PropertyImportColumns = Readonly<Partial<Record<PropertyImportField, number>>>;

export const MAX_PROPERTY_IMPORT_ROWS = 2000;

/** De dónde salen las propiedades: la exportación de Tokko o su API. */
export const PROPERTY_IMPORT_SOURCES = ['file', 'api'] as const;
export type PropertyImportSource = (typeof PROPERTY_IMPORT_SOURCES)[number];

export const PROPERTY_IMPORT_STATUSES = ['pending', 'running', 'done', 'failed'] as const;
export type PropertyImportStatus = (typeof PROPERTY_IMPORT_STATUSES)[number];

/** Por qué falló una importación entera (las filas con problemas no la hacen fallar). */
export const PROPERTY_IMPORT_FAILURES = [
  'file_missing',
  'unreadable_file',
  'too_many_rows',
  'source_unavailable',
] as const;
export type PropertyImportFailure = (typeof PROPERTY_IMPORT_FAILURES)[number];

/**
 * Qué pasó con una fila. Las primeras dejan la fila sin importar; las últimas son avisos de una
 * propiedad que sí se importó.
 */
export const PROPERTY_IMPORT_PROBLEM_CODES = [
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
  'photos_not_downloaded',
  'description_truncated',
  'location_not_found',
] as const;
export type PropertyImportProblemCode = (typeof PROPERTY_IMPORT_PROBLEM_CODES)[number];

/** Los problemas que no impiden importar la propiedad. */
export const PROPERTY_IMPORT_WARNINGS: readonly PropertyImportProblemCode[] = [
  'owner_not_linked',
  'development_not_found',
  'total_surface_dropped',
  'photos_not_downloaded',
  'description_truncated',
];

/**
 * `existing`: ya había una propiedad con ese código. `completed`: ya estaba y se le agregó lo que
 * no tenía (solo desde la API).
 */
export type PropertyImportRowOutcome = 'created' | 'existing' | 'completed' | 'failed';

/** De qué es una fila: una propiedad o, desde la API, un emprendimiento. */
export type PropertyImportSubject = 'property' | 'development';

/**
 * Una fila con problemas: el número de fila (en la API, su lugar en el listado), el dato, la
 * propiedad (o el emprendimiento) si se creó o ya existía y, desde la API, el código de Tokko.
 */
export interface PropertyImportRowProblem {
  readonly rowNumber: number;
  readonly code: PropertyImportProblemCode;
  readonly field: PropertyImportField | undefined;
  /** La propiedad o, si `subject` es `development`, el emprendimiento. */
  readonly propertyId: string | undefined;
  readonly reference?: string | undefined;
  /** Sin valor, una propiedad. */
  readonly subject?: PropertyImportSubject | undefined;
}

/** Los emprendimientos que trajo la API, antes que las propiedades. */
export interface PropertyImportDevelopmentTotals {
  readonly created: number;
  readonly existing: number;
  readonly completed: number;
  readonly failed: number;
}

export interface PropertyImportTotals {
  /** Filas de datos del archivo, sin el encabezado, o propiedades del listado de la API. */
  readonly rows: number;
  readonly processed: number;
  readonly created: number;
  readonly existing: number;
  readonly completed: number;
  readonly failed: number;
  /** Solo desde la API. */
  readonly developments: PropertyImportDevelopmentTotals;
}

export interface PropertyImportSnapshot {
  readonly id: PropertyImportId;
  readonly source: PropertyImportSource;
  /** Vacío si es de la API. */
  readonly fileName: string;
  /** Vacío si es de la API. */
  readonly storageKey: string;
  readonly status: PropertyImportStatus;
  readonly columns: PropertyImportColumns;
  /** Desde la API: si ya trajo los emprendimientos (al retomar, sigue con las propiedades). */
  readonly developmentsDone: boolean;
  readonly totals: PropertyImportTotals;
  readonly failure: PropertyImportFailure | undefined;
  readonly requestedBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly startedAt: Date | undefined;
  readonly finishedAt: Date | undefined;
}

export interface NotATokkoExportError {
  readonly type: 'NotATokkoExport';
  /** Los encabezados que faltan. */
  readonly missing: readonly string[];
}

export interface EmptyPropertyImportFileError {
  readonly type: 'EmptyImportFile';
}

export interface TooManyPropertyImportRowsError {
  readonly type: 'TooManyImportRows';
  readonly max: number;
}

export interface PropertyImportFinishedError {
  readonly type: 'ImportFinished';
}

/** Se pidió una importación de la exportación de Tokko: la procesa un job (pg-boss). */
export type PropertyImportRequested = DomainEvent<
  'properties.import_requested',
  { readonly importId: string }
>;

/** Se pidió una importación desde la API de Tokko: la procesa otro job (pg-boss). */
export type TokkoApiImportRequested = DomainEvent<
  'properties.tokko_api_import_requested',
  { readonly importId: string }
>;

export type PropertyImportEvent = PropertyImportRequested | TokkoApiImportRequested;

/** Un encabezado sin mayúsculas, acentos ni espacios de más. */
function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dónde está cada columna de Tokko; falla si falta una de las indispensables. */
export function tokkoColumns(
  headers: readonly string[],
): Result<PropertyImportColumns, NotATokkoExportError> {
  const normalized = headers.map(normalizeHeader);
  const columns: Partial<Record<PropertyImportField, number>> = {};
  for (const field of PROPERTY_IMPORT_FIELDS) {
    const index = normalized.indexOf(normalizeHeader(TOKKO_PROPERTY_COLUMNS[field]));
    if (index !== -1) columns[field] = index;
  }
  const missing = REQUIRED_TOKKO_COLUMNS.filter((field) => columns[field] === undefined);
  if (missing.length > 0) {
    return err({
      type: 'NotATokkoExport',
      missing: missing.map((field) => TOKKO_PROPERTY_COLUMNS[field]),
    });
  }
  return ok(columns);
}

/** Cuántas filas puede tener el archivo: al menos una, como mucho `MAX_PROPERTY_IMPORT_ROWS`. */
export function checkPropertyImportRows(
  rows: number,
): Result<void, EmptyPropertyImportFileError | TooManyPropertyImportRowsError> {
  if (rows === 0) return err({ type: 'EmptyImportFile' });
  if (rows > MAX_PROPERTY_IMPORT_ROWS) {
    return err({ type: 'TooManyImportRows', max: MAX_PROPERTY_IMPORT_ROWS });
  }
  return ok(undefined);
}

export const NO_DEVELOPMENT_TOTALS: PropertyImportDevelopmentTotals = {
  created: 0,
  existing: 0,
  completed: 0,
  failed: 0,
};

const NO_TOTALS: Omit<PropertyImportTotals, 'rows'> = {
  processed: 0,
  created: 0,
  existing: 0,
  completed: 0,
  failed: 0,
  developments: NO_DEVELOPMENT_TOTALS,
};

/**
 * Una importación de propiedades de Tokko. Nace pendiente; el job la pone en proceso, suma cada
 * fila y la termina (o la marca fallida si no pudo leer el archivo o Tokko no respondió). Si el job
 * se corta, retoma desde la última fila procesada.
 */
export class PropertyImport extends AggregateRoot<PropertyImportId, PropertyImportEvent> {
  #state: Omit<PropertyImportSnapshot, 'id'>;

  private constructor(id: PropertyImportId, state: Omit<PropertyImportSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static request(input: {
    readonly id: PropertyImportId;
    readonly fileName: string;
    readonly storageKey: string;
    readonly headers: readonly string[];
    readonly rows: number;
    readonly requestedBy: string;
    readonly now: Date;
  }): Result<
    PropertyImport,
    NotATokkoExportError | EmptyPropertyImportFileError | TooManyPropertyImportRowsError
  > {
    const columns = tokkoColumns(input.headers);
    if (columns.isErr()) return err(columns.error);
    const rows = checkPropertyImportRows(input.rows);
    if (rows.isErr()) return err(rows.error);

    const job = new PropertyImport(input.id, {
      source: 'file',
      fileName: input.fileName,
      storageKey: input.storageKey,
      status: 'pending',
      columns: columns.value,
      developmentsDone: true,
      totals: { rows: input.rows, ...NO_TOTALS },
      failure: undefined,
      requestedBy: input.requestedBy,
      createdAt: input.now,
      updatedAt: input.now,
      startedAt: undefined,
      finishedAt: undefined,
    });
    job.record({
      type: 'properties.import_requested',
      aggregateId: input.id,
      occurredAt: input.now,
      payload: { importId: input.id },
    });
    return ok(job);
  }

  /** Una importación desde la API de Tokko: cuántas propiedades hay lo sabe el job al empezar. */
  static requestFromTokkoApi(input: {
    readonly id: PropertyImportId;
    readonly requestedBy: string;
    readonly now: Date;
  }): PropertyImport {
    const job = new PropertyImport(input.id, {
      source: 'api',
      fileName: '',
      storageKey: '',
      status: 'pending',
      columns: {},
      developmentsDone: false,
      totals: { rows: 0, ...NO_TOTALS },
      failure: undefined,
      requestedBy: input.requestedBy,
      createdAt: input.now,
      updatedAt: input.now,
      startedAt: undefined,
      finishedAt: undefined,
    });
    job.record({
      type: 'properties.tokko_api_import_requested',
      aggregateId: input.id,
      occurredAt: input.now,
      payload: { importId: input.id },
    });
    return job;
  }

  static restore(snapshot: PropertyImportSnapshot): PropertyImport {
    const { id, ...state } = snapshot;
    return new PropertyImport(id, state);
  }

  get source(): PropertyImportSource {
    return this.#state.source;
  }

  get status(): PropertyImportStatus {
    return this.#state.status;
  }

  get storageKey(): string {
    return this.#state.storageKey;
  }

  get columns(): PropertyImportColumns {
    return this.#state.columns;
  }

  get requestedBy(): string {
    return this.#state.requestedBy;
  }

  get totals(): PropertyImportTotals {
    return this.#state.totals;
  }

  get developmentsDone(): boolean {
    return this.#state.developmentsDone;
  }

  /** Suma un emprendimiento traído de la API. */
  recordDevelopment(outcome: PropertyImportRowOutcome, now: Date): void {
    const d = this.#state.totals.developments;
    this.#state = {
      ...this.#state,
      totals: {
        ...this.#state.totals,
        developments: { ...d, [outcome]: d[outcome] + 1 },
      },
      updatedAt: now,
    };
  }

  /** Empieza a recorrer los emprendimientos (de nuevo, si un corte dejó la mitad). */
  restartDevelopments(now: Date): void {
    this.#state = {
      ...this.#state,
      totals: { ...this.#state.totals, developments: NO_DEVELOPMENT_TOTALS },
      updatedAt: now,
    };
  }

  /** Ya trajo los emprendimientos: si se corta, retoma con las propiedades. */
  finishDevelopments(now: Date): void {
    this.#state = { ...this.#state, developmentsDone: true, updatedAt: now };
  }

  get isFinished(): boolean {
    return this.#state.status === 'done' || this.#state.status === 'failed';
  }

  /** Las filas ya procesadas se saltean al retomar. */
  wasProcessed(rowIndex: number): boolean {
    return rowIndex < this.#state.totals.processed;
  }

  /** La pone en proceso. Una que quedó en proceso (el job se cortó) se retoma. */
  start(now: Date): Result<void, PropertyImportFinishedError> {
    if (this.isFinished) return err({ type: 'ImportFinished' });
    if (this.#state.status === 'pending') {
      this.#state = { ...this.#state, status: 'running', startedAt: now, updatedAt: now };
    }
    return ok(undefined);
  }

  /** Cuántas propiedades trae el listado de la API (cambia si en Tokko se cargan o se borran). */
  countRows(rows: number, now: Date): void {
    this.#state = {
      ...this.#state,
      totals: { ...this.#state.totals, rows: Math.max(rows, this.#state.totals.processed) },
      updatedAt: now,
    };
  }

  /** Suma una fila procesada. */
  recordRow(outcome: PropertyImportRowOutcome, now: Date): void {
    const t = this.#state.totals;
    const add = (kind: PropertyImportRowOutcome) => (outcome === kind ? 1 : 0);
    this.#state = {
      ...this.#state,
      totals: {
        ...t,
        processed: t.processed + 1,
        created: t.created + add('created'),
        existing: t.existing + add('existing'),
        completed: t.completed + add('completed'),
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

  fail(failure: PropertyImportFailure, now: Date): void {
    this.#state = { ...this.#state, status: 'failed', failure, finishedAt: now, updatedAt: now };
  }

  toSnapshot(): PropertyImportSnapshot {
    return { id: this.id, ...this.#state };
  }
}
