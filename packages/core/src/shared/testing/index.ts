// Fakes del shared kernel para tests de casos de uso (`@norde/core/shared/testing`).

import type {
  AuditEntry,
  AuditLog,
  Clock,
  EventPublisher,
  IdGenerator,
} from '../application/ports';
import type { DomainEvent } from '../domain/domain-event';
import type { Result } from '../domain/result';

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
