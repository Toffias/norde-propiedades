import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { DomainEvent } from '../../shared/domain/domain-event';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { DocumentNotReadyError, PropertyDocumentStatus } from './property-document';
import { MAX_LIST_DOCUMENT_PROPERTIES, type PropertySheetLayout } from './property-sheet';
import type { PropertyId } from './property';

export type PropertyListDocumentId = Id<'PropertyListDocument'>;

export interface PropertyListDocumentSnapshot {
  readonly id: PropertyListDocumentId;
  /** Las propiedades en el orden en que salen, fijadas al pedirlo. */
  readonly propertyIds: readonly PropertyId[];
  readonly layout: PropertySheetLayout;
  readonly includeAgent: boolean;
  readonly status: PropertyDocumentStatus;
  readonly storageKey: string | undefined;
  readonly error: string | undefined;
  readonly requestedBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NothingToPrintError {
  readonly type: 'NothingToExport';
}
export interface TooManyToPrintError {
  readonly type: 'TooManyToExport';
  readonly max: number;
  readonly total: number;
}

/** Se pidió el PDF de varias propiedades: lo arma un job y avisa en la barra. */
export type PropertyListDocumentRequested = DomainEvent<
  'properties.list_document_requested',
  { readonly documentId: string; readonly layout: PropertySheetLayout; readonly count: number }
>;

/**
 * El PDF de las propiedades elegidas en el buscador, en uno de los formatos de la ficha. Las
 * propiedades se fijan al pedirlo: el job arma ese conjunto aunque después cambie el filtro.
 */
export class PropertyListDocument extends AggregateRoot<
  PropertyListDocumentId,
  PropertyListDocumentRequested
> {
  #state: Omit<PropertyListDocumentSnapshot, 'id'>;

  private constructor(id: PropertyListDocumentId, state: Omit<PropertyListDocumentSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static request(input: {
    readonly id: PropertyListDocumentId;
    readonly propertyIds: readonly PropertyId[];
    readonly layout: PropertySheetLayout;
    readonly includeAgent: boolean;
    readonly requestedBy: string;
    readonly now: Date;
  }): Result<PropertyListDocument, NothingToPrintError | TooManyToPrintError> {
    const propertyIds = [...new Set(input.propertyIds)];
    if (propertyIds.length === 0) return err({ type: 'NothingToExport' });
    if (propertyIds.length > MAX_LIST_DOCUMENT_PROPERTIES) {
      return err({
        type: 'TooManyToExport',
        max: MAX_LIST_DOCUMENT_PROPERTIES,
        total: propertyIds.length,
      });
    }
    const document = new PropertyListDocument(input.id, {
      propertyIds,
      layout: input.layout,
      includeAgent: input.includeAgent,
      status: 'pending',
      storageKey: undefined,
      error: undefined,
      requestedBy: input.requestedBy,
      createdAt: input.now,
      updatedAt: input.now,
    });
    document.record({
      type: 'properties.list_document_requested',
      aggregateId: input.id,
      occurredAt: input.now,
      payload: { documentId: input.id, layout: input.layout, count: propertyIds.length },
    });
    return ok(document);
  }

  static restore(snapshot: PropertyListDocumentSnapshot): PropertyListDocument {
    const { id, ...state } = snapshot;
    return new PropertyListDocument(id, state);
  }

  get propertyIds(): readonly PropertyId[] {
    return this.#state.propertyIds;
  }

  get layout(): PropertySheetLayout {
    return this.#state.layout;
  }

  get includeAgent(): boolean {
    return this.#state.includeAgent;
  }

  get status(): PropertyDocumentStatus {
    return this.#state.status;
  }

  get requestedBy(): string {
    return this.#state.requestedBy;
  }

  get createdAt(): Date {
    return this.#state.createdAt;
  }

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

  toSnapshot(): PropertyListDocumentSnapshot {
    return { id: this.id, ...this.#state };
  }
}
