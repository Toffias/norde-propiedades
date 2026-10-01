import { parseId, type AuditState, type AuditTarget } from '../../shared';
import type { Property } from '../domain/property';
import type { PropertyRepository } from '../domain/property.repository';

// Lo que comparten los commands de propiedades: auditoría y búsqueda por ID.

export interface PropertyNotFoundError {
  readonly type: 'PropertyNotFound';
}

export interface InvalidInputError {
  readonly type: 'InvalidInput';
  readonly issues: readonly string[];
}

/** Valores crudos del alta. Los usuarios y la sucursal van por ID. */
export function propertyAuditState(property: Property): AuditState {
  const s = property.toSnapshot();
  return {
    code: s.code,
    propertyType: s.kind,
    status: s.status,
    street: s.address.street,
    streetNumber: s.address.streetNumber,
    floor: s.address.floor,
    unit: s.address.unit,
    neighborhood: s.address.neighborhood,
    city: s.address.city,
    province: s.address.province,
    publishAddress: s.publishAddress,
    portalTitle: s.portalTitle,
    latitude: s.coordinates?.latitude,
    longitude: s.coordinates?.longitude,
    locationId: s.locationId,
    operations: s.operations.map((o) => ({
      operation: o.operation,
      currency: o.currency,
      priceCents: o.priceCents ?? null,
    })),
    producerUserId: s.producerUserId,
    branchId: s.branchId,
  };
}

export function propertyTarget(action: string, propertyId: string): AuditTarget {
  return { action, entityType: 'property', entityId: propertyId, clientIds: [] };
}

export async function findProperty(
  properties: PropertyRepository,
  rawId: string,
): Promise<Property | undefined> {
  const id = parseId<'Property'>(rawId);
  return id.isOk() ? properties.findById(id.value) : undefined;
}
