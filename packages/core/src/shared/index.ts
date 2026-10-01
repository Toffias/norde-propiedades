// API pública del shared kernel (`@norde/core/shared`).

export { AggregateRoot } from './domain/aggregate-root';
export type { DomainEvent } from './domain/domain-event';
export { parseId, type Id, type InvalidIdError } from './domain/id';
export { Err, Ok, err, ok, type Result } from './domain/result';
export { Email, type InvalidEmailError } from './domain/value-objects/email';
export { Phone, type InvalidPhoneError } from './domain/value-objects/phone';

export { Actor, type Permission, type SystemActorName } from './application/actor';
export type { ForbiddenError } from './application/errors';
export { nextId } from './application/next-id';
export {
  toOffsetLimit,
  toPage,
  type Page,
  type PageRequest,
  type PageSlice,
} from './application/pagination';
export type {
  AuditEntry,
  AuditLog,
  Clock,
  EventPublisher,
  FieldChange,
  IdGenerator,
  UnitOfWork,
} from './application/ports';
