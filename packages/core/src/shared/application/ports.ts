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

/** Desde dónde se ejecutó el cambio. Lo deriva el `Actor` (`actor.source`). */
export type AuditSource = 'gestion' | 'agent' | 'web' | 'scheduler' | 'import';

/**
 * Valor crudo de un campo auditado: centavos como `bigint`, IDs, fechas. La pantalla lo formatea.
 * Otras entidades se referencian por ID, nunca copiando nombres, teléfonos ni emails.
 */
export type AuditValue =
  | string
  | number
  | boolean
  | bigint
  | Date
  | null
  | readonly AuditValue[]
  | { readonly [field: string]: AuditValue };

export interface FieldChange {
  readonly before: AuditValue;
  readonly after: AuditValue;
}

/** Diff por campo. Las filas hijas van prefijadas contra la entidad principal (`phones.mobile`). */
export type AuditChanges = Readonly<Record<string, FieldChange>>;

interface AuditEntryBase {
  readonly actorId: string;
  /** `<entidad>.<acción>`: `client.registered`, `property.deleted`. */
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly source: AuditSource;
  /** Agrupa las entradas de un mismo command o request. */
  readonly correlationId?: string;
  /** Clientes cuyos datos aparecen en la entrada: es lo que permite la supresión. */
  readonly clientIds: readonly string[];
}

/**
 * Entrada del historial de cambios. Se arma con `auditCreated`, `auditUpdated` o `auditAction`
 * (`shared/application/audit.ts`).
 *
 * - `created`: los valores iniciales (`before: null`).
 * - `updated`: solo los campos que cambiaron. Sin cambios, no se registra.
 * - `action`: baja, restauración, unificación, cambio de estado, asignación; el diff es opcional.
 */
export type AuditEntry =
  | (AuditEntryBase & { readonly kind: 'created'; readonly changes: AuditChanges })
  | (AuditEntryBase & { readonly kind: 'updated'; readonly changes: AuditChanges })
  | (AuditEntryBase & { readonly kind: 'action'; readonly changes?: AuditChanges });

/** Registro de trazabilidad: quién hizo qué, cuándo y sobre qué entidad. Solo de inserción. */
export interface AuditLog {
  record(entry: AuditEntry): Promise<void>;
}
