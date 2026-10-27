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
/**
 * Lo escucha el cruce con los seguimientos automáticos de los clientes (#106) para avisar las
 * bajas. Los precios van en centavos como texto (el payload es JSON); sin precio anterior (cambió la
 * moneda) o sin precio nuevo, no vienen. Los eventos anteriores a #106 no los traen.
 */
export type PropertyPriceChanged = DomainEvent<
  'properties.property_price_changed',
  PropertyPayload & {
    readonly operation: string;
    readonly currency: string;
    readonly oldPriceCents?: string;
    readonly newPriceCents?: string;
  }
>;

/**
 * Algo de la propiedad cambió (cualquier edición, alta, baja o cambio de estado): la web revalida
 * su ficha y sus listados (ADR 0023). Uno por guardado, sin importar cuántos campos cambiaron.
 */
export type PropertyChanged = DomainEvent<
  'properties.property_changed',
  PropertyPayload & {
    /**
     * Los emprendimientos de la unidad: el de ahora y, si se pasó a otro, el de antes (los dos
     * tienen que actualizar sus avisos). Vacío si no es una unidad.
     */
    readonly developmentIds: readonly string[];
  }
>;

export type PropertyEvent =
  | PropertyCreated
  | PropertyChanged
  | PropertyDeleted
  | PropertyRestored
  | PropertyStatusChanged
  | PropertyPriceChanged;
