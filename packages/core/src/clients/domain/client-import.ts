import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { DomainEvent } from '../../shared/domain/domain-event';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import { normalizeName } from './duplicate-check';

// Importación de contactos desde un Excel: el panel sube el archivo con el mapeo de columnas y un
// job lo procesa fila por fila, con la misma regla de duplicados que el alta manual.

export type ClientImportId = Id<'ClientImport'>;

/** Los datos del contacto que se pueden leer de una columna. */
export const IMPORT_FIELDS = [
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
export type ImportField = (typeof IMPORT_FIELDS)[number];

const CONTACT_FIELDS: readonly ImportField[] = [
  'phone',
  'mobile',
  'workPhone',
  'email',
  'secondaryEmail',
];

/** Qué columna (desde 0) se lee para cada dato. Un dato sin columna no se importa. */
export type ImportMapping = Readonly<Partial<Record<ImportField, number>>>;

export const MAX_IMPORT_ROWS = 10_000;
export const MAX_IMPORT_COLUMNS = 100;

export const CLIENT_IMPORT_STATUSES = ['pending', 'running', 'done', 'failed'] as const;
export type ClientImportStatus = (typeof CLIENT_IMPORT_STATUSES)[number];

/** Por qué falló una importación entera (las filas con problemas no la hacen fallar). */
export const CLIENT_IMPORT_FAILURES = ['file_missing', 'unreadable_file', 'too_many_rows'] as const;
export type ClientImportFailure = (typeof CLIENT_IMPORT_FAILURES)[number];

/** Qué pasó con una fila que no se importó. */
export const IMPORT_PROBLEM_CODES = [
  'duplicate',
  'missing_name',
  'missing_contact',
  'invalid_phone',
  'invalid_email',
  'invalid_value',
] as const;
export type ImportProblemCode = (typeof IMPORT_PROBLEM_CODES)[number];

export type ImportRowOutcome = 'created' | 'duplicate' | 'failed';

/**
 * Una fila que no se importó. Sin datos personales: el número de fila, el dato con problemas y,
 * si ya existía, el ID del contacto.
 */
export interface ImportRowProblem {
  readonly rowNumber: number;
  readonly code: ImportProblemCode;
  readonly field: ImportField | undefined;
  readonly clientId: string | undefined;
}

export interface ClientImportTotals {
  /** Filas de datos del archivo, sin el encabezado. */
  readonly rows: number;
  readonly processed: number;
  readonly created: number;
  readonly duplicates: number;
  readonly failed: number;
}

export interface ClientImportSnapshot {
  readonly id: ClientImportId;
  readonly fileName: string;
  readonly storageKey: string;
  readonly status: ClientImportStatus;
  readonly mapping: ImportMapping;
  /** El agente a cargo de los contactos importados, con su sucursal. */
  readonly agentId: string | undefined;
  readonly branchId: string | undefined;
  readonly totals: ClientImportTotals;
  readonly failure: ClientImportFailure | undefined;
  readonly requestedBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly startedAt: Date | undefined;
  readonly finishedAt: Date | undefined;
}

export interface InvalidImportMappingError {
  readonly type: 'InvalidImportMapping';
  readonly reason: 'missing_name' | 'missing_contact' | 'unknown_column' | 'repeated_column';
}

export interface EmptyImportFileError {
  readonly type: 'EmptyImportFile';
}

export interface TooManyImportRowsError {
  readonly type: 'TooManyImportRows';
  readonly max: number;
}

export interface ImportFinishedError {
  readonly type: 'ImportFinished';
}

/** Se pidió una importación: la procesa un job (pg-boss) y la pantalla muestra el avance. */
export type ClientImportRequested = DomainEvent<
  'clients.import_requested',
  { readonly importId: string }
>;

/**
 * El mapeo sirve si tiene de dónde sacar el nombre (o la empresa) y al menos un teléfono o email,
 * y cada columna existe y se usa una sola vez.
 */
export function validateImportMapping(
  mapping: ImportMapping,
  columnCount: number,
): Result<void, InvalidImportMappingError> {
  const columns = IMPORT_FIELDS.map((field) => mapping[field]).filter(
    (column) => column !== undefined,
  );
  if (columns.some((c) => !Number.isInteger(c) || c < 0 || c >= columnCount)) {
    return err({ type: 'InvalidImportMapping', reason: 'unknown_column' });
  }
  if (new Set(columns).size !== columns.length) {
    return err({ type: 'InvalidImportMapping', reason: 'repeated_column' });
  }
  if (mapping.name === undefined && mapping.companyName === undefined) {
    return err({ type: 'InvalidImportMapping', reason: 'missing_name' });
  }
  if (CONTACT_FIELDS.every((field) => mapping[field] === undefined)) {
    return err({ type: 'InvalidImportMapping', reason: 'missing_contact' });
  }
  return ok(undefined);
}

/** Cuántas filas puede tener el archivo: al menos una, como mucho `MAX_IMPORT_ROWS`. */
export function checkImportRows(
  rows: number,
): Result<void, EmptyImportFileError | TooManyImportRowsError> {
  if (rows === 0) return err({ type: 'EmptyImportFile' });
  if (rows > MAX_IMPORT_ROWS) return err({ type: 'TooManyImportRows', max: MAX_IMPORT_ROWS });
  return ok(undefined);
}

/**
 * Encabezados que se reconocen solos: los de la exportación de contactos y los habituales de una
 * planilla (Tokko, Google Contacts), sin mayúsculas ni acentos.
 */
const HEADER_SYNONYMS: Readonly<Record<ImportField, readonly string[]>> = {
  name: ['nombre', 'nombre y apellido', 'nombre completo', 'apellido y nombre', 'contacto', 'name'],
  kind: ['tipo de registro'],
  companyName: ['empresa', 'compania', 'razon social', 'company'],
  phone: ['telefono', 'tel', 'tel.', 'telefono fijo', 'telefono particular', 'phone'],
  mobile: ['celular', 'cel', 'cel.', 'movil', 'whatsapp', 'mobile'],
  workPhone: ['telefono laboral', 'telefono del trabajo', 'tel. laboral'],
  email: ['email', 'e-mail', 'mail', 'correo', 'correo electronico'],
  secondaryEmail: ['email 2', 'otro email', 'email secundario', 'mail 2', 'e-mail 2'],
  clientTypes: ['tipos de cliente', 'tipo de cliente'],
  jobTitle: ['cargo', 'puesto'],
  website: ['web', 'sitio web', 'pagina web', 'website'],
  address: ['direccion', 'domicilio'],
  country: ['pais'],
  documentNumber: ['dni', 'documento', 'numero de documento', 'nro. de documento', 'cuit', 'cuil'],
  birthDate: ['fecha de nacimiento', 'nacimiento', 'cumpleanos'],
};

/** El mapeo que se propone a partir de los encabezados; quien importa lo revisa. */
export function suggestImportMapping(headers: readonly string[]): ImportMapping {
  const normalized = headers.map((header) => normalizeName(header));
  const mapping: Partial<Record<ImportField, number>> = {};
  const used = new Set<number>();
  for (const field of IMPORT_FIELDS) {
    const column = normalized.findIndex(
      (header, index) => !used.has(index) && HEADER_SYNONYMS[field].includes(header),
    );
    if (column === -1) continue;
    mapping[field] = column;
    used.add(column);
  }
  return mapping;
}

const NO_TOTALS: Omit<ClientImportTotals, 'rows'> = {
  processed: 0,
  created: 0,
  duplicates: 0,
  failed: 0,
};

/**
 * Una importación de contactos. Nace pendiente; el job la pone en proceso, suma cada fila y la
 * termina (o la marca fallida si no pudo leer el archivo). Si el job se corta, retoma desde la
 * última fila procesada.
 */
export class ClientImport extends AggregateRoot<ClientImportId, ClientImportRequested> {
  #state: Omit<ClientImportSnapshot, 'id'>;

  private constructor(id: ClientImportId, state: Omit<ClientImportSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static request(input: {
    readonly id: ClientImportId;
    readonly fileName: string;
    readonly storageKey: string;
    readonly mapping: ImportMapping;
    readonly columnCount: number;
    readonly rows: number;
    readonly agentId: string | undefined;
    readonly branchId: string | undefined;
    readonly requestedBy: string;
    readonly now: Date;
  }): Result<
    ClientImport,
    InvalidImportMappingError | EmptyImportFileError | TooManyImportRowsError
  > {
    const rows = checkImportRows(input.rows);
    if (rows.isErr()) return err(rows.error);
    const mapping = validateImportMapping(input.mapping, input.columnCount);
    if (mapping.isErr()) return err(mapping.error);

    const job = new ClientImport(input.id, {
      fileName: input.fileName,
      storageKey: input.storageKey,
      status: 'pending',
      mapping: input.mapping,
      agentId: input.agentId,
      branchId: input.branchId,
      totals: { rows: input.rows, ...NO_TOTALS },
      failure: undefined,
      requestedBy: input.requestedBy,
      createdAt: input.now,
      updatedAt: input.now,
      startedAt: undefined,
      finishedAt: undefined,
    });
    job.record({
      type: 'clients.import_requested',
      aggregateId: input.id,
      occurredAt: input.now,
      payload: { importId: input.id },
    });
    return ok(job);
  }

  static restore(snapshot: ClientImportSnapshot): ClientImport {
    const { id, ...state } = snapshot;
    return new ClientImport(id, state);
  }

  get status(): ClientImportStatus {
    return this.#state.status;
  }

  get storageKey(): string {
    return this.#state.storageKey;
  }

  get mapping(): ImportMapping {
    return this.#state.mapping;
  }

  get agentId(): string | undefined {
    return this.#state.agentId;
  }

  get branchId(): string | undefined {
    return this.#state.branchId;
  }

  get totals(): ClientImportTotals {
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
  start(now: Date): Result<void, ImportFinishedError> {
    if (this.isFinished) return err({ type: 'ImportFinished' });
    if (this.#state.status === 'pending') {
      this.#state = { ...this.#state, status: 'running', startedAt: now, updatedAt: now };
    }
    return ok(undefined);
  }

  /** Suma una fila procesada. */
  recordRow(outcome: ImportRowOutcome, now: Date): void {
    const t = this.#state.totals;
    this.#state = {
      ...this.#state,
      totals: {
        ...t,
        processed: t.processed + 1,
        created: t.created + (outcome === 'created' ? 1 : 0),
        duplicates: t.duplicates + (outcome === 'duplicate' ? 1 : 0),
        failed: t.failed + (outcome === 'failed' ? 1 : 0),
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

  fail(failure: ClientImportFailure, now: Date): void {
    this.#state = { ...this.#state, status: 'failed', failure, finishedAt: now, updatedAt: now };
  }

  toSnapshot(): ClientImportSnapshot {
    return { id: this.id, ...this.#state };
  }
}
