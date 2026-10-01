import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { DomainEvent } from '../../shared/domain/domain-event';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { PriceCurrency, PropertyOperationKind } from './property-catalog';
import type { PropertyId } from './property';

export type PropertyDocumentId = Id<'PropertyDocument'>;

/** Ficha en PDF, PDF de vidriera (una hoja para la vidriera de la oficina) y reporte al propietario. */
export const PROPERTY_DOCUMENT_KINDS = ['sheet', 'showcase', 'owner_report'] as const;
export type PropertyDocumentKind = (typeof PROPERTY_DOCUMENT_KINDS)[number];

export const PROPERTY_DOCUMENT_STATUSES = ['pending', 'ready', 'failed'] as const;
export type PropertyDocumentStatus = (typeof PROPERTY_DOCUMENT_STATUSES)[number];

/** Período del reporte al propietario, en días `AAAA-MM-DD` de Buenos Aires. */
export interface ReportPeriod {
  readonly from: string;
  readonly to: string;
}

export interface PropertyDocumentSnapshot {
  readonly id: PropertyDocumentId;
  readonly propertyId: PropertyId;
  readonly kind: PropertyDocumentKind;
  readonly status: PropertyDocumentStatus;
  readonly period: ReportPeriod | undefined;
  readonly storageKey: string | undefined;
  readonly error: string | undefined;
  readonly requestedBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ReportPeriodRequiredError {
  readonly type: 'ReportPeriodRequired';
}
export interface DocumentNotReadyError {
  readonly type: 'DocumentNotReady';
}

/** Se pidió un PDF: lo arma un job (pg-boss) y la pantalla muestra el avance. */
export type PropertyDocumentRequested = DomainEvent<
  'properties.document_requested',
  { readonly propertyId: string; readonly documentId: string; readonly kind: PropertyDocumentKind }
>;

/** Qué dirección muestra el PDF, según la configuración de "Ficha y PDF". */
export type PdfAddressDisplay = 'full' | 'approximate' | 'hidden';

/** La dirección que imprime el PDF: exacta, la "para publicar" o solo barrio y localidad. */
export function pdfAddress(
  property: {
    readonly address: {
      readonly street: string;
      readonly streetNumber: string | undefined;
      readonly floor: string | undefined;
      readonly unit: string | undefined;
      readonly neighborhood: string;
      readonly city: string;
    };
    readonly publishAddress: string;
  },
  display: PdfAddressDisplay,
): string {
  const { address } = property;
  const place = [address.neighborhood, address.city].filter((part) => part !== '').join(', ');
  if (display === 'hidden') return place;
  if (display === 'approximate') {
    return [property.publishAddress, place].filter((part) => part !== '').join(' · ');
  }
  const street = [address.street, address.streetNumber].filter(Boolean).join(' ');
  const unit = [
    address.floor === undefined ? undefined : `Piso ${address.floor}`,
    address.unit === undefined ? undefined : `Unidad ${address.unit}`,
  ]
    .filter(Boolean)
    .join(' ');
  return [street, unit, place].filter((part) => part !== '').join(' · ');
}

/** Un precio del PDF: el monto, o "Consultar" si no se muestra. */
export interface PdfPrice {
  readonly operation: PropertyOperationKind;
  readonly currency: PriceCurrency;
  /** `undefined`: "Consultar precio". */
  readonly priceCents: bigint | undefined;
}

/**
 * Qué precio imprime el PDF de cada operación. No se muestra si la configuración lo oculta, si la
 * propiedad se publica sin precio o si la operación es "a consultar".
 */
export function pdfPrices(
  operations: readonly {
    readonly operation: PropertyOperationKind;
    readonly currency: PriceCurrency;
    readonly priceCents: bigint | undefined;
    readonly priceOnRequest: boolean;
  }[],
  rules: { readonly showPrice: boolean; readonly showPriceOnWeb: boolean },
): readonly PdfPrice[] {
  return operations.map((operation) => ({
    operation: operation.operation,
    currency: operation.currency,
    priceCents:
      rules.showPrice && rules.showPriceOnWeb && !operation.priceOnRequest
        ? operation.priceCents
        : undefined,
  }));
}

/**
 * Un PDF pedido desde la ficha. Nace pendiente y el job lo marca listo (con su archivo) o fallido.
 * El reporte al propietario lleva el período que cubre.
 */
export class PropertyDocument extends AggregateRoot<PropertyDocumentId, PropertyDocumentRequested> {
  #state: Omit<PropertyDocumentSnapshot, 'id'>;

  private constructor(id: PropertyDocumentId, state: Omit<PropertyDocumentSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static request(input: {
    readonly id: PropertyDocumentId;
    readonly propertyId: PropertyId;
    readonly kind: PropertyDocumentKind;
    readonly period: ReportPeriod | undefined;
    readonly requestedBy: string;
    readonly now: Date;
  }): Result<PropertyDocument, ReportPeriodRequiredError> {
    if (input.kind === 'owner_report' && input.period === undefined) {
      return err({ type: 'ReportPeriodRequired' });
    }
    const document = new PropertyDocument(input.id, {
      propertyId: input.propertyId,
      kind: input.kind,
      status: 'pending',
      period: input.kind === 'owner_report' ? input.period : undefined,
      storageKey: undefined,
      error: undefined,
      requestedBy: input.requestedBy,
      createdAt: input.now,
      updatedAt: input.now,
    });
    document.record({
      type: 'properties.document_requested',
      aggregateId: input.id,
      occurredAt: input.now,
      payload: { propertyId: input.propertyId, documentId: input.id, kind: input.kind },
    });
    return ok(document);
  }

  static restore(snapshot: PropertyDocumentSnapshot): PropertyDocument {
    const { id, ...state } = snapshot;
    return new PropertyDocument(id, state);
  }

  get propertyId(): PropertyId {
    return this.#state.propertyId;
  }

  get kind(): PropertyDocumentKind {
    return this.#state.kind;
  }

  get status(): PropertyDocumentStatus {
    return this.#state.status;
  }

  get period(): ReportPeriod | undefined {
    return this.#state.period;
  }

  get requestedBy(): string {
    return this.#state.requestedBy;
  }

  /** El archivo listo, para descargarlo o enviarlo. */
  readyFile(): Result<string, DocumentNotReadyError> {
    const key = this.#state.storageKey;
    return this.#state.status === 'ready' && key !== undefined
      ? ok(key)
      : err({ type: 'DocumentNotReady' });
  }

  complete(storageKey: string, now: Date): void {
    this.#state = { ...this.#state, status: 'ready', storageKey, error: undefined, updatedAt: now };
  }

  fail(reason: string, now: Date): void {
    this.#state = { ...this.#state, status: 'failed', error: reason.slice(0, 500), updatedAt: now };
  }

  toSnapshot(): PropertyDocumentSnapshot {
    return { id: this.id, ...this.#state };
  }
}
