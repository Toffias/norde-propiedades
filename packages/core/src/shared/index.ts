// API pública del shared kernel (`@norde/core/shared`).

export { AggregateRoot } from './domain/aggregate-root';
export type { DomainEvent } from './domain/domain-event';
export { parseId, type Id, type InvalidIdError } from './domain/id';
export { Err, Ok, err, ok, type Result } from './domain/result';

export { Actor, type Permission, type SystemActorName } from './application/actor';
export type {
  AuditEntry,
  AuditLog,
  Clock,
  EventPublisher,
  FieldChange,
  IdGenerator,
  UnitOfWork,
} from './application/ports';
