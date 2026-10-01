import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { Coordinates } from './coordinates';
import { propertySlug, suggestPortalTitle, suggestPublishAddress } from './listing-text';
import type { PriceCurrency, PropertyKind, PropertyOperationKind } from './property-catalog';
import {
  DEFAULT_PUBLICATION,
  EMPTY_CHARACTERISTICS,
  EMPTY_DEAL_ATTRIBUTES,
  EMPTY_INTERNAL_INFO,
  optionalText,
  validateCharacteristics,
  type CoveredExceedsTotalError,
  type CustomAttributeEntry,
  type DealAttributes,
  type InternalInfo,
  type NegativeCharacteristicError,
  type PropertyCharacteristics,
  type Publication,
} from './property-details';
import type { PropertyEvent } from './property.events';
import { canTransition, MANUAL_STATUSES, type PropertyStatus } from './property-status';

export type PropertyId = Id<'Property'>;

/** Una operación con su precio. Sin precio cargado, `priceCents` es `undefined`. */
export interface PropertyOperation {
  readonly operation: PropertyOperationKind;
  readonly currency: PriceCurrency;
  readonly priceCents: bigint | undefined;
  /** "Precio a consultar": la web no muestra el precio de esta operación. */
  readonly priceOnRequest: boolean;
  /** Comisión pactada, en porcentaje con hasta dos decimales (de 0 a 100). */
  readonly commissionPct: number | undefined;
}

/** Lo que se carga de una operación: sin "a consultar" ni comisión, quedan en su valor inicial. */
export type OperationInput = Pick<PropertyOperation, 'operation' | 'currency' | 'priceCents'> &
  Partial<Pick<PropertyOperation, 'priceOnRequest' | 'commissionPct'>>;

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
  readonly description: string;
  readonly characteristics: PropertyCharacteristics;
  readonly deal: DealAttributes;
  /** Servicios, ambientes y adicionales del catálogo, por ID. */
  readonly featureIds: readonly string[];
  readonly customAttributes: readonly CustomAttributeEntry[];
  readonly internal: InternalInfo;
  readonly publication: Publication;
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
/** Una propiedad tiene al menos una operación, y como mucho una de cada tipo. */
export interface InvalidOperationsError {
  readonly type: 'InvalidOperations';
  readonly reason: 'empty' | 'duplicated';
}
export interface InvalidCommissionError {
  readonly type: 'InvalidCommission';
}
export interface InvalidReferenceCodeError {
  readonly type: 'InvalidReferenceCode';
}

/** Código de referencia: letras y números, con guiones; se guarda en mayúsculas. */
const REFERENCE_CODE = /^[A-Z0-9][A-Z0-9-]{1,19}$/;

export interface NewProperty {
  readonly id: PropertyId;
  readonly code: string;
  readonly kind: PropertyKind;
  readonly operation: OperationInput;
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

function toOperation(input: OperationInput): PropertyOperation {
  return {
    operation: input.operation,
    currency: input.currency,
    priceCents: input.priceCents,
    priceOnRequest: input.priceOnRequest ?? false,
    commissionPct: input.commissionPct,
  };
}

function sameOperation(a: PropertyOperation, b: PropertyOperation): boolean {
  return (
    a.currency === b.currency &&
    a.priceCents === b.priceCents &&
    a.priceOnRequest === b.priceOnRequest &&
    a.commissionPct === b.commissionPct
  );
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  const before = new Set(a);
  return a.length === b.length && b.every((item) => before.has(item));
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, field: unknown) =>
    typeof field === 'bigint' ? `${field.toString()}n` : field,
  );
}

/** Igualdad por valor de las secciones (estructuras planas, sin fechas). */
function sameValue(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

/** Dos decimales como mucho: la comisión se guarda en `numeric(5, 2)`. */
function validCommission(pct: number | undefined): boolean {
  if (pct === undefined) return true;
  return pct >= 0 && pct <= 100 && Math.abs(Math.round(pct * 100) - pct * 100) < 1e-9;
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
      operations: [toOperation(input.operation)],
      tagIds: [],
      producerUserId: input.producerUserId,
      branchId: input.branchId,
      description: '',
      characteristics: EMPTY_CHARACTERISTICS,
      deal: EMPTY_DEAL_ATTRIBUTES,
      featureIds: [],
      customAttributes: [],
      internal: EMPTY_INTERNAL_INFO,
      publication: DEFAULT_PUBLICATION,
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
          ? { ...o, currency: change.currency, priceCents: change.priceCents }
          : o,
      ),
      updatedAt: now,
    };
    this.#recordPriceChange(current, change, now);
    return ok(true);
  }

  /**
   * Reemplaza las operaciones: agrega, quita y edita (precio, moneda, "a consultar", comisión).
   * Cada precio que cambia va al historial y emite `PropertyPriceChanged`. Devuelve `false` si
   * quedaron iguales.
   */
  setOperations(
    inputs: readonly OperationInput[],
    now: Date,
  ): Result<
    boolean,
    PropertyInTrashError | InvalidOperationsError | NegativePriceError | InvalidCommissionError
  > {
    if (this.isDeleted) return err({ type: 'PropertyInTrash' });
    if (inputs.length === 0) return err({ type: 'InvalidOperations', reason: 'empty' });
    if (new Set(inputs.map((input) => input.operation)).size !== inputs.length) {
      return err({ type: 'InvalidOperations', reason: 'duplicated' });
    }
    const next = inputs.map(toOperation);
    for (const operation of next) {
      if (operation.priceCents !== undefined && operation.priceCents < 0n) {
        return err({ type: 'NegativePrice' });
      }
      if (!validCommission(operation.commissionPct)) return err({ type: 'InvalidCommission' });
    }
    const current = this.#state.operations;
    const unchanged =
      current.length === next.length &&
      next.every((operation) => {
        const before = current.find((o) => o.operation === operation.operation);
        return before !== undefined && sameOperation(before, operation);
      });
    if (unchanged) return ok(false);

    this.#state = { ...this.#state, operations: next, updatedAt: now };
    for (const operation of next) {
      const before = current.find((o) => o.operation === operation.operation);
      const priceChanged =
        before === undefined
          ? operation.priceCents !== undefined
          : before.currency !== operation.currency || before.priceCents !== operation.priceCents;
      if (priceChanged) this.#recordPriceChange(before, operation, now);
    }
    return ok(true);
  }

  /** Cambia el código de referencia a mano (§4.6). Que no esté tomado lo verifica el caso de uso. */
  changeCode(
    code: string,
    now: Date,
  ): Result<boolean, PropertyInTrashError | InvalidReferenceCodeError> {
    if (this.isDeleted) return err({ type: 'PropertyInTrash' });
    const clean = code.trim().toUpperCase();
    if (!REFERENCE_CODE.test(clean)) return err({ type: 'InvalidReferenceCode' });
    if (clean === this.#state.code) return ok(false);
    // El slug no cambia: es la URL pública y ya puede estar compartida.
    this.#state = { ...this.#state, code: clean, updatedAt: now };
    return ok(true);
  }

  /** Dirección real, dirección para publicar, ubicación del catálogo y coordenadas. */
  updateLocation(
    change: {
      readonly address: PropertyAddress;
      readonly publishAddress: string | undefined;
      readonly locationId: string | undefined;
      readonly coordinates: Coordinates | undefined;
    },
    now: Date,
  ): Result<boolean, PropertyInTrashError> {
    if (this.isDeleted) return err({ type: 'PropertyInTrash' });
    const address = cleanAddress(change.address);
    const next = {
      address,
      publishAddress:
        optionalText(change.publishAddress) ??
        suggestPublishAddress(address.street, address.streetNumber),
      locationId: change.locationId,
      coordinates: change.coordinates,
    };
    const current = {
      address: this.#state.address,
      publishAddress: this.#state.publishAddress,
      locationId: this.#state.locationId,
      coordinates: this.#state.coordinates,
    };
    if (sameValue(current, next)) return ok(false);
    this.#state = { ...this.#state, ...next, updatedAt: now };
    return ok(true);
  }

  /** Título para portales y descripción. Sin título, se vuelve a sugerir. */
  updateDescription(
    change: { readonly portalTitle: string | undefined; readonly description: string },
    now: Date,
  ): Result<boolean, PropertyInTrashError> {
    if (this.isDeleted) return err({ type: 'PropertyInTrash' });
    const [first] = this.#state.operations;
    const portalTitle =
      optionalText(change.portalTitle) ??
      suggestPortalTitle({
        kind: this.#state.kind,
        operation: first?.operation ?? 'sale',
        neighborhood: this.#state.address.neighborhood,
      });
    const description = change.description.trim();
    if (portalTitle === this.#state.portalTitle && description === this.#state.description) {
      return ok(false);
    }
    this.#state = { ...this.#state, portalTitle, description, updatedAt: now };
    return ok(true);
  }

  updateCharacteristics(
    characteristics: PropertyCharacteristics,
    now: Date,
  ): Result<
    boolean,
    PropertyInTrashError | NegativeCharacteristicError | CoveredExceedsTotalError
  > {
    if (this.isDeleted) return err({ type: 'PropertyInTrash' });
    const valid = validateCharacteristics(characteristics);
    if (valid.isErr()) return err(valid.error);
    if (sameValue(this.#state.characteristics, characteristics)) return ok(false);
    this.#state = { ...this.#state, characteristics, updatedAt: now };
    return ok(true);
  }

  /** Exclusividad, permuta, escritura inmediata, financiación, apto crédito y expensas. */
  updateDeal(
    deal: DealAttributes,
    now: Date,
  ): Result<boolean, PropertyInTrashError | NegativePriceError> {
    if (this.isDeleted) return err({ type: 'PropertyInTrash' });
    if (deal.expensesCents !== undefined && deal.expensesCents < 0n) {
      return err({ type: 'NegativePrice' });
    }
    if (sameValue(this.#state.deal, deal)) return ok(false);
    this.#state = { ...this.#state, deal, updatedAt: now };
    return ok(true);
  }

  /** Servicios, ambientes y adicionales. Que existan en el catálogo lo verifica el caso de uso. */
  updateFeatures(featureIds: readonly string[], now: Date): Result<boolean, PropertyInTrashError> {
    if (this.isDeleted) return err({ type: 'PropertyInTrash' });
    const next = [...new Set(featureIds)];
    if (sameList(this.#state.featureIds, next)) return ok(false);
    this.#state = { ...this.#state, featureIds: next, updatedAt: now };
    return ok(true);
  }

  /** Valores ya validados contra sus definiciones (`validateCustomAttributes`). */
  updateCustomAttributes(
    entries: readonly CustomAttributeEntry[],
    now: Date,
  ): Result<boolean, PropertyInTrashError> {
    if (this.isDeleted) return err({ type: 'PropertyInTrash' });
    const byId = (a: CustomAttributeEntry, b: CustomAttributeEntry) =>
      a.attributeId.localeCompare(b.attributeId);
    const next = [...entries].sort(byId);
    if (sameValue([...this.#state.customAttributes].sort(byId), next)) return ok(false);
    this.#state = { ...this.#state, customAttributes: next, updatedAt: now };
    return ok(true);
  }

  /** Tasadores, usuario de mantenimiento, llaves, información legal y comentarios internos. */
  updateInternalInfo(info: InternalInfo, now: Date): Result<boolean, PropertyInTrashError> {
    if (this.isDeleted) return err({ type: 'PropertyInTrash' });
    const next: InternalInfo = {
      maintenanceUserId: info.maintenanceUserId,
      appraiserUserIds: [...new Set(info.appraiserUserIds)].sort(),
      keysLocation: optionalText(info.keysLocation),
      legalInfo: optionalText(info.legalInfo),
      internalComments: optionalText(info.internalComments),
    };
    const current = this.#state.internal;
    if (sameValue({ ...current, appraiserUserIds: [...current.appraiserUserIds].sort() }, next)) {
      return ok(false);
    }
    this.#state = { ...this.#state, internal: next, updatedAt: now };
    return ok(true);
  }

  /**
   * "Publicar en web" (con o sin precio), destacada y dirección exacta. Se marca en cualquier
   * estado: la web la muestra solo mientras esté disponible (`isPubliclyListed`).
   */
  updatePublication(
    change: Partial<Publication>,
    now: Date,
  ): Result<boolean, PropertyInTrashError> {
    if (this.isDeleted) return err({ type: 'PropertyInTrash' });
    const next: Publication = { ...this.#state.publication, ...change };
    if (sameValue(this.#state.publication, next)) return ok(false);
    this.#state = { ...this.#state, publication: next, updatedAt: now };
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
    if (sameList(this.#state.tagIds, next)) return ok(false);
    this.#state = { ...this.#state, tagIds: next, updatedAt: now };
    return ok(true);
  }

  #recordPriceChange(
    previous: Pick<PropertyOperation, 'currency' | 'priceCents'> | undefined,
    next: Pick<PropertyOperation, 'operation' | 'currency' | 'priceCents'>,
    now: Date,
  ): void {
    this.#priceChanges.push({
      operation: next.operation,
      currency: next.currency,
      // Si cambió la moneda, el precio anterior no se compara: queda sin valor previo.
      oldPriceCents: previous?.currency === next.currency ? previous.priceCents : undefined,
      newPriceCents: next.priceCents,
      changedAt: now,
    });
    this.record({
      type: 'properties.property_price_changed',
      aggregateId: this.id,
      occurredAt: now,
      payload: {
        propertyId: this.id,
        code: this.#state.code,
        operation: next.operation,
        currency: next.currency,
      },
    });
  }

  toSnapshot(): PropertySnapshot {
    return { id: this.id, ...this.#state };
  }
}
