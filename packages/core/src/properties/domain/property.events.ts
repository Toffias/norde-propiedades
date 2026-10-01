import type { DomainEvent } from '../../shared/domain/domain-event';

interface PropertyPayload {
  readonly propertyId: string;
  readonly code: string;
}

export type PropertyCreated = DomainEvent<'properties.property_created', PropertyPayload>;
export type PropertyDeleted = DomainEvent<'properties.property_deleted', PropertyPayload>;
export type PropertyRestored = DomainEvent<'properties.property_restored', PropertyPayload>;

export type PropertyEvent = PropertyCreated | PropertyDeleted | PropertyRestored;
