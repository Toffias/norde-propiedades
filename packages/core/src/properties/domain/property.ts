import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { Coordinates } from './coordinates';
import { propertySlug, suggestPortalTitle, suggestPublishAddress } from './listing-text';
import type { PriceCurrency, PropertyKind, PropertyOperationKind } from './property-catalog';
import type { PropertyEvent } from './property.events';
import { canTransition, MANUAL_STATUSES, type PropertyStatus } from './property-status';

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
  /** Ubicación del catálogo jerárquico. Las propiedades viejas solo tienen la ubicación en texto. */
  readonly locationId: string | undefined;
  readonly operations: readonly PropertyOperation[];
  /** Etiquetas de propiedades, por ID. */
  readonly tagIds: readonly string[];
  /** Captador: usuario de identity, solo por ID. */
  readonly producerUserId: string | undefined;
  /** Sucursal del captador al dar el alta: de identity, solo por ID. */
  readonly branchId: string | undefined;
  readonly statusChangedAt: Date;
  readonly deletedAt: Date | undefined;
  readonly deletedBy: string | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Un cambio de precio, para el historial de precios (`property_price_changes`). */
export interface PriceChange {
  readonly operation: PropertyOperationKind;
  readonly currency: PriceCurrency;
  readonly oldPriceCents: bigint | undefined;
  readonly newPriceCents: bigint | undefined;
  readonly changedAt: Date;
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
/** Una propiedad de la papelera no se edita: primero se restaura. */
export interface PropertyInTrashError {
  readonly type: 'PropertyInTrash';
}
export interface InvalidStatusTransitionError {
  readonly type: 'InvalidStatusTransition';
  readonly from: PropertyStatus;
  readonly to: PropertyStatus;
}
export interface StatusNotManualError {
  readonly type: 'StatusNotManual';
}
export interface OperationNotFoundError {
  readonly type: 'OperationNotFound';
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
  readonly locationId: string | undefined;
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
  readonly #priceChanges: PriceChange[] = [];

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
      locationId: input.locationId,
      operations: [input.operation],
      tagIds: [],
      producerUserId: input.producerUserId,
      branchId: input.branchId,
      statusChangedAt: input.now,
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

  get status(): PropertyStatus {
    return this.#state.status;
  }

  get producerUserId(): string | undefined {
    return this.#state.producerUserId;
  }

  get tagIds(): readonly string[] {
    return this.#state.tagIds;
  }

  /** Cambios de precio hechos sobre esta instancia, para guardarlos en el historial. */
  get priceChanges(): readonly PriceChange[] {
    return this.#priceChanges;
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

  /**
   * Cambia el estado a mano. Devuelve `false` si ya estaba en ese estado (no hay cambio que
   * registrar). "Reservada" no se elige a mano: la marca una reserva.
   */
  changeStatus(
    to: PropertyStatus,
    now: Date,
  ): Result<boolean, PropertyInTrashError | StatusNotManualError | InvalidStatusTransitionError> {
    if (this.isDeleted) return err({ type: 'PropertyInTrash' });
    if (!MANUAL_STATUSES.includes(to)) return err({ type: 'StatusNotManual' });
    const from = this.#state.status;
    if (from === to) return ok(false);
    if (!canTransition(from, to)) return err({ type: 'InvalidStatusTransition', from, to });
    this.#state = { ...this.#state, status: to, statusChangedAt: now, updatedAt: now };
    this.record({
      type: 'properties.property_status_changed',
      aggregateId: this.id,
      occurredAt: now,
      payload: { propertyId: this.id, code: this.#state.code, from, to },
    });
    return ok(true);
  }

  /**
   * Cambia el captador. La propiedad pasa a la sucursal del nuevo captador, así "Mi sucursal"
   * sigue a quien la gestiona. Devuelve `false` si no cambió.
   */
  changeProducer(
    producer: { readonly userId: string; readonly branchId: string | undefined },
    now: Date,
  ): Result<boolean, PropertyInTrashError> {
    if (this.isDeleted) return err({ type: 'PropertyInTrash' });
    if (this.#state.producerUserId === producer.userId) return ok(false);
    this.#state = {
      ...this.#state,
      producerUserId: producer.userId,
      branchId: producer.branchId,
      updatedAt: now,
    };
    return ok(true);
  }

  /**
   * Cambia el precio de una operación que la propiedad ya tiene. Sin precio, queda "a consultar".
   * El cambio va al historial de precios. Devuelve `false` si no cambió.
   */
  changePrice(
    change: {
      readonly operation: PropertyOperationKind;
      readonly currency: PriceCurrency;
      readonly priceCents: bigint | undefined;
    },
    now: Date,
  ): Result<boolean, PropertyInTrashError | OperationNotFoundError | NegativePriceError> {
    if (this.isDeleted) return err({ type: 'PropertyInTrash' });
    if (change.priceCents !== undefined && change.priceCents < 0n) {
      return err({ type: 'NegativePrice' });
    }
    const current = this.#state.operations.find((o) => o.operation === change.operation);
    if (current === undefined) return err({ type: 'OperationNotFound' });
    if (current.currency === change.currency && current.priceCents === change.priceCents) {
      return ok(false);
    }
    this.#state = {
      ...this.#state,
      operations: this.#state.operations.map((o) =>
        o.operation === change.operation
          ? { operation: o.operation, currency: change.currency, priceCents: change.priceCents }
          : o,
      ),
      updatedAt: now,
    };
    this.#priceChanges.push({
      operation: change.operation,
      currency: change.currency,
      // Si cambió la moneda, el precio anterior no se compara: queda sin valor previo.
      oldPriceCents: current.currency === change.currency ? current.priceCents : undefined,
      newPriceCents: change.priceCents,
      changedAt: now,
    });
    this.record({
      type: 'properties.property_price_changed',
      aggregateId: this.id,
      occurredAt: now,
      payload: {
        propertyId: this.id,
        code: this.#state.code,
        operation: change.operation,
        currency: change.currency,
      },
    });
    return ok(true);
  }

  /** Suma y quita etiquetas. Devuelve `false` si quedaron las mismas. */
  changeTags(
    change: { readonly add: readonly string[]; readonly remove: readonly string[] },
    now: Date,
  ): Result<boolean, PropertyInTrashError> {
    if (this.isDeleted) return err({ type: 'PropertyInTrash' });
    const removed = new Set(change.remove);
    const next = [...new Set([...this.#state.tagIds, ...change.add])].filter(
      (id) => !removed.has(id),
    );
    const before = new Set(this.#state.tagIds);
    const same = next.length === before.size && next.every((id) => before.has(id));
    if (same) return ok(false);
    this.#state = { ...this.#state, tagIds: next, updatedAt: now };
    return ok(true);
  }

  toSnapshot(): PropertySnapshot {
    return { id: this.id, ...this.#state };
  }
}
