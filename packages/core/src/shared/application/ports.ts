import type { DomainEvent } from '../domain/domain-event';

/** Fuente de tiempo. En el core nunca se usa `new Date()` directamente. */
export interface Clock {
  now(): Date;
}

/** Generador de identificadores (UUID v7 en producción). */
export interface IdGenerator {
  next(): string;
}

/**
 * Transacción de base de datos. `TContext` es lo que el caso de uso necesita dentro de la
 * transacción (repositorios, outbox, auditoría), ya ligado a la misma conexión.
 *
 * Contrato de la implementación: si `work` lanza una excepción **o devuelve un `Err`**,
 * se hace rollback.
 */
export interface UnitOfWork<TContext> {
  run<T>(work: (context: TContext) => Promise<T>): Promise<T>;
}

/** Publica eventos de dominio en el outbox (misma transacción que el cambio). */
export interface EventPublisher {
  publish(events: readonly DomainEvent[]): Promise<void>;
}

export interface FieldChange {
  readonly before: unknown;
  readonly after: unknown;
}

export interface AuditEntry {
  readonly actorId: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly changes?: Readonly<Record<string, FieldChange>>;
}

/** Registro de trazabilidad: quién hizo qué, cuándo y sobre qué entidad. */
export interface AuditLog {
  record(entry: AuditEntry): Promise<void>;
}
