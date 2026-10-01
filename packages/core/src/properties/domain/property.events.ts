import type { DomainEvent } from '../../shared/domain/domain-event';

interface PropertyPayload {
  readonly propertyId: string;
  readonly code: string;
}

export type PropertyCreated = DomainEvent<'properties.property_created', PropertyPayload>;
export type PropertyDeleted = DomainEvent<'properties.property_deleted', PropertyPayload>;
export type PropertyRestored = DomainEvent<'properties.property_restored', PropertyPayload>;

export type PropertyStatusChanged = DomainEvent<
  'properties.property_status_changed',
  PropertyPayload & { readonly from: string; readonly to: string }
>;
/** Lo va a escuchar el cruce con las búsquedas guardadas de los clientes (#11). */
export type PropertyPriceChanged = DomainEvent<
  'properties.property_price_changed',
  PropertyPayload & { readonly operation: string; readonly currency: string }
>;

export type PropertyEvent =
  | PropertyCreated
  | PropertyDeleted
  | PropertyRestored
  | PropertyStatusChanged
  | PropertyPriceChanged;
