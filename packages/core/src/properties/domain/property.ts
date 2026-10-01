import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { Coordinates } from './coordinates';
import { propertySlug, suggestPortalTitle, suggestPublishAddress } from './listing-text';
import type { PriceCurrency, PropertyKind, PropertyOperationKind } from './property-catalog';
import type { PropertyEvent } from './property.events';
import type { PropertyStatus } from './property-status';

export type PropertyId = Id<'Property'>;

/** Una operación con su precio. Sin precio cargado, `priceCents` es `undefined`. */
export interface PropertyOperation {
  readonly operation: PropertyOperationKind;
  readonly currency: PriceCurrency;
  readonly priceCents: bigint | undefined;
}

/** Calle, altura, piso y unidad son privados: la web y los portales usan `publishAddress`. */
export interface PropertyAddress {
  readonly street: string;
  readonly streetNumber: string | undefined;
  readonly floor: string | undefined;
  readonly unit: string | undefined;
  readonly neighborhood: string;
  readonly city: string;
  readonly province: string;
}

export interface PropertySnapshot {
  readonly id: PropertyId;
  /** Código de referencia (`CAS0013`): único, lo entrega la numeración de Mi empresa. */
  readonly code: string;
  readonly slug: string;
  readonly kind: PropertyKind;
  readonly status: PropertyStatus;
  readonly address: PropertyAddress;
  readonly publishAddress: string;
  readonly portalTitle: string;
  readonly coordinates: Coordinates | undefined;
  readonly operations: readonly PropertyOperation[];
  /** Captador: usuario de identity, solo por ID. */
  readonly producerUserId: string | undefined;
  /** Sucursal del captador al dar el alta: de identity, solo por ID. */
  readonly branchId: string | undefined;
  readonly deletedAt: Date | undefined;
  readonly deletedBy: string | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PropertyAlreadyDeletedError {
  readonly type: 'PropertyAlreadyDeleted';
}
export interface PropertyNotDeletedError {
  readonly type: 'PropertyNotDeleted';
}
export interface NegativePriceError {
  readonly type: 'NegativePrice';
}

export interface NewProperty {
  readonly id: PropertyId;
  readonly code: string;
  readonly kind: PropertyKind;
  readonly operation: PropertyOperation;
  readonly address: PropertyAddress;
  /** Vacío: se sugiere a partir de la calle y la altura. */
  readonly publishAddress: string | undefined;
  /** Vacío: se sugiere a partir del tipo, la operación y el barrio. */
  readonly portalTitle: string | undefined;
  readonly coordinates: Coordinates | undefined;
  readonly producerUserId: string | undefined;
  readonly branchId: string | undefined;
  readonly now: Date;
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

function cleanAddress(address: PropertyAddress): PropertyAddress {
  return {
    street: address.street.trim(),
    streetNumber: optionalText(address.streetNumber),
    floor: optionalText(address.floor),
    unit: optionalText(address.unit),
    neighborhood: address.neighborhood.trim(),
    city: address.city.trim(),
    province: address.province.trim(),
  };
}

/**
 * Propiedad de la cartera de Norde. El alta es corta (tipo, operación, dirección y ubicación); el
 * resto se completa en la ficha. Nace como borrador: no se publica hasta que alguien la habilita.
 */
export class Property extends AggregateRoot<PropertyId, PropertyEvent> {
  #state: Omit<PropertySnapshot, 'id'>;

  private constructor(id: PropertyId, state: Omit<PropertySnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static create(input: NewProperty): Result<Property, NegativePriceError> {
    const { priceCents } = input.operation;
    if (priceCents !== undefined && priceCents < 0n) return err({ type: 'NegativePrice' });

    const address = cleanAddress(input.address);
    const portalTitle =
      optionalText(input.portalTitle) ??
      suggestPortalTitle({
        kind: input.kind,
        operation: input.operation.operation,
        neighborhood: address.neighborhood,
      });
    const property = new Property(input.id, {
      code: input.code,
      slug: propertySlug(portalTitle, input.code),
      kind: input.kind,
      status: 'draft',
      address,
      publishAddress:
        optionalText(input.publishAddress) ??
        suggestPublishAddress(address.street, address.streetNumber),
      portalTitle,
      coordinates: input.coordinates,
      operations: [input.operation],
      producerUserId: input.producerUserId,
      branchId: input.branchId,
      deletedAt: undefined,
      deletedBy: undefined,
      createdAt: input.now,
      updatedAt: input.now,
    });
    property.record({
      type: 'properties.property_created',
      aggregateId: input.id,
      occurredAt: input.now,
      payload: { propertyId: input.id, code: input.code },
    });
    return ok(property);
  }

  static restore(snapshot: PropertySnapshot): Property {
    const { id, ...state } = snapshot;
    return new Property(id, state);
  }

  get code(): string {
    return this.#state.code;
  }

  get isDeleted(): boolean {
    return this.#state.deletedAt !== undefined;
  }

  /** De quién es, para las reglas de pertenencia: el captador y su sucursal. */
  get ownership(): {
    readonly ownerId: string | undefined;
    readonly ownerBranchId: string | undefined;
  } {
    return { ownerId: this.#state.producerUserId, ownerBranchId: this.#state.branchId };
  }

  /** Baja lógica: va a la papelera con quién la borró y cuándo. */
  delete(by: string, now: Date): Result<void, PropertyAlreadyDeletedError> {
    if (this.isDeleted) return err({ type: 'PropertyAlreadyDeleted' });
    this.#state = { ...this.#state, deletedAt: now, deletedBy: by, updatedAt: now };
    this.record({
      type: 'properties.property_deleted',
      aggregateId: this.id,
      occurredAt: now,
      payload: { propertyId: this.id, code: this.#state.code },
    });
    return ok(undefined);
  }

  restoreFromTrash(now: Date): Result<void, PropertyNotDeletedError> {
    if (!this.isDeleted) return err({ type: 'PropertyNotDeleted' });
    this.#state = { ...this.#state, deletedAt: undefined, deletedBy: undefined, updatedAt: now };
    this.record({
      type: 'properties.property_restored',
      aggregateId: this.id,
      occurredAt: now,
      payload: { propertyId: this.id, code: this.#state.code },
    });
    return ok(undefined);
  }

  toSnapshot(): PropertySnapshot {
    return { id: this.id, ...this.#state };
  }
}
