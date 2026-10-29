// Fakes del shared kernel para tests de casos de uso (`@norde/core/shared/testing`).

import type {
  IdempotencyClaim,
  IdempotencyKeys,
  IdempotencyScope,
} from '../application/idempotency';
import type {
  AuditEntry,
  AuditLog,
  Clock,
  EventPublisher,
  IdGenerator,
} from '../application/ports';
import type {
  Spreadsheet,
  SpreadsheetReader,
  UnreadableSpreadsheetError,
} from '../application/spreadsheet-reader';
import type { DomainEvent } from '../domain/domain-event';
import { err, ok, type Result } from '../domain/result';

/** Reloj fijo, avanzable a mano. */
export class FixedClock implements Clock {
  #now: Date;

  constructor(now: Date | string = '2026-01-01T12:00:00.000Z') {
    this.#now = new Date(now);
  }

  now(): Date {
    return new Date(this.#now);
  }

  advance(milliseconds: number): void {
    this.#now = new Date(this.#now.getTime() + milliseconds);
  }
}

/** IDs determinísticos con formato UUID v7 válido: ...-000000000001, ...-000000000002, etc. */
export class SequentialIdGenerator implements IdGenerator {
  #counter = 0;

  next(): string {
    this.#counter += 1;
    return `00000000-0000-7000-8000-${this.#counter.toString().padStart(12, '0')}`;
  }
}

export class InMemoryEventPublisher implements EventPublisher {
  readonly published: DomainEvent[] = [];

  publish(events: readonly DomainEvent[]): Promise<void> {
    this.published.push(...events);
    return Promise.resolve();
  }
}

export class InMemoryAuditLog implements AuditLog {
  readonly entries: AuditEntry[] = [];

  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

/**
 * Claves de idempotencia en memoria. Guarda el resultado como JSON, igual que la base, y la
 * transacción fake lo restaura en el rollback (`rows`).
 */
export class InMemoryIdempotencyKeys implements IdempotencyKeys {
  readonly rows = new Map<string, string | null>();

  claim(scope: IdempotencyScope): Promise<IdempotencyClaim> {
    const id = InMemoryIdempotencyKeys.#id(scope);
    const stored = this.rows.get(id);
    if (stored === undefined) {
      this.rows.set(id, null);
      return Promise.resolve({ claimed: true });
    }
    if (stored === null) throw new Error(`Idempotency key ${id} was claimed but never completed`);
    return Promise.resolve({ claimed: false, result: JSON.parse(stored) as unknown });
  }

  complete(scope: IdempotencyScope, result: unknown): Promise<void> {
    this.rows.set(InMemoryIdempotencyKeys.#id(scope), JSON.stringify(result));
    return Promise.resolve();
  }

  static #id(scope: IdempotencyScope): string {
    return `${scope.actorId}:${scope.command}:${scope.key}`;
  }
}

/** El valor de un `Ok`; si es un `Err`, el test falla mostrando el error. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(`Expected Ok, got Err: ${JSON.stringify(result.error)}`);
  return result.value;
}

/** El error de un `Err`; si es un `Ok`, el test falla. */
export function unwrapErr<T, E>(result: Result<T, E>): E {
  if (result.isOk()) throw new Error('Expected Err, got Ok');
  return result.error;
}

/**
 * Lee "planillas" de prueba: los bytes son una clave registrada con `register` (no hace falta
 * armar un Excel de verdad). Una clave desconocida es un archivo que no se puede leer.
 */
export class FakeSpreadsheetReader implements SpreadsheetReader {
  readonly #sheets = new Map<string, readonly (readonly (string | undefined)[])[]>();

  /** La primera fila son los encabezados. Devuelve los bytes que la representan. */
  register(
    name: string,
    rows: readonly (readonly (string | undefined)[])[],
  ): Uint8Array<ArrayBuffer> {
    this.#sheets.set(name, rows);
    return new TextEncoder().encode(name);
  }

  open(bytes: Uint8Array): Promise<Result<Spreadsheet, UnreadableSpreadsheetError>> {
    const rows = this.#sheets.get(new TextDecoder().decode(bytes));
    if (rows === undefined) return Promise.resolve(err({ type: 'UnreadableSpreadsheet' }));
    const [headers = [], ...data] = rows;
    const sheet: Spreadsheet = {
      headers: headers.map((h) => h ?? ''),
      rowCount: data.length,
      async *rows() {
        for (const [index, cells] of data.entries()) {
          await Promise.resolve();
          yield { rowNumber: index + 2, cells };
        }
      },
    };
    return Promise.resolve(ok(sheet));
  }
}
