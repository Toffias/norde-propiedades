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

/**
 * Algo de la propiedad cambió (cualquier edición, alta, baja o cambio de estado): la web revalida
 * su ficha y sus listados (ADR 0023). Uno por guardado, sin importar cuántos campos cambiaron.
 */
export type PropertyChanged = DomainEvent<'properties.property_changed', PropertyPayload>;

export type PropertyEvent =
  | PropertyCreated
  | PropertyChanged
  | PropertyDeleted
  | PropertyRestored
  | PropertyStatusChanged
  | PropertyPriceChanged;
