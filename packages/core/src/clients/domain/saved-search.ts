import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { ClientId } from './client';
import type { MatchableSearch } from './saved-search-match';

export type SavedSearchId = Id<'SavedSearch'>;

/** Tope de búsquedas vigentes por cliente: también acota el cálculo de coincidencia. */
export const MAX_SAVED_SEARCHES_PER_CLIENT = 20;
export const MAX_SAVED_SEARCH_LOCATIONS = 20;
export const MAX_SAVED_SEARCH_NAME_LENGTH = 80;
export const MAX_SAVED_SEARCH_ROOMS = 20;

/** Lo que el asesor define de una búsqueda. */
export interface SavedSearchFields {
  readonly name: string | undefined;
  /** Oportunidad del mismo cliente, por ID. */
  readonly opportunityId: string | undefined;
  readonly operation: string;
  /** Vacío: cualquier tipo. */
  readonly propertyTypes: readonly string[];
  /** Sin moneda: sin rango de precio. */
  readonly currency: string | undefined;
  readonly minPriceCents: bigint | undefined;
  readonly maxPriceCents: bigint | undefined;
  /** Ubicaciones del módulo properties, por ID. Vacío: cualquiera. */
  readonly locationIds: readonly string[];
  readonly minRooms: number | undefined;
  /** Si el cliente recibe por email las propiedades nuevas que coinciden (#11, etapa 4). */
  readonly autoSend: boolean;
}

export interface SavedSearchSnapshot extends SavedSearchFields {
  readonly id: SavedSearchId;
  readonly clientId: ClientId;
  /** El resto de los filtros, tal como vinieron (importaciones): no se editan ni se cruzan. */
  readonly extraCriteria: Readonly<Record<string, unknown>>;
  /** El cliente se dio de baja de los envíos automáticos. */
  readonly unsubscribedAt: Date | undefined;
  readonly lastMatchedAt: Date | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | undefined;
  readonly deletedBy: string | undefined;
}

export type InvalidSavedSearchReason =
  | 'currency_required'
  | 'negative_price'
  | 'price_range'
  | 'rooms'
  | 'too_many_locations'
  | 'name_too_long';

export interface InvalidSavedSearchError {
  readonly type: 'InvalidSavedSearch';
  readonly reason: InvalidSavedSearchReason;
}

/** El cliente pidió la baja: el asesor no le vuelve a activar los envíos. */
export interface SavedSearchUnsubscribedError {
  readonly type: 'SavedSearchUnsubscribed';
}

export interface SavedSearchLimitReachedError {
  readonly type: 'SavedSearchLimitReached';
  readonly max: number;
}

/** Si el cliente puede tener una búsqueda vigente más. */
export function checkSavedSearchLimit(
  activeCount: number,
): Result<void, SavedSearchLimitReachedError> {
  return activeCount >= MAX_SAVED_SEARCHES_PER_CLIENT
    ? err({ type: 'SavedSearchLimitReached', max: MAX_SAVED_SEARCHES_PER_CLIENT })
    : ok(undefined);
}

function normalize(fields: SavedSearchFields): Result<SavedSearchFields, InvalidSavedSearchError> {
  const invalid = (reason: InvalidSavedSearchReason) =>
    err<InvalidSavedSearchError>({ type: 'InvalidSavedSearch', reason });
  const cleaned = fields.name?.trim().replace(/\s+/g, ' ');
  const name = cleaned === '' ? undefined : cleaned;
  if (name !== undefined && name.length > MAX_SAVED_SEARCH_NAME_LENGTH) {
    return invalid('name_too_long');
  }
  const { minPriceCents: min, maxPriceCents: max } = fields;
  if ((min !== undefined && min < 0n) || (max !== undefined && max < 0n)) {
    return invalid('negative_price');
  }
  const hasPrice = min !== undefined || max !== undefined;
  if (hasPrice && fields.currency === undefined) return invalid('currency_required');
  if (min !== undefined && max !== undefined && min > max) return invalid('price_range');
  if (
    fields.minRooms !== undefined &&
    (!Number.isInteger(fields.minRooms) ||
      fields.minRooms < 1 ||
      fields.minRooms > MAX_SAVED_SEARCH_ROOMS)
  ) {
    return invalid('rooms');
  }
  const locationIds = [...new Set(fields.locationIds.map((id) => id.toLowerCase()))];
  if (locationIds.length > MAX_SAVED_SEARCH_LOCATIONS) return invalid('too_many_locations');
  return ok({
    name,
    opportunityId: fields.opportunityId?.toLowerCase(),
    operation: fields.operation,
    propertyTypes: [...new Set(fields.propertyTypes)],
    // Sin rango, la moneda no filtra nada: no se guarda.
    currency: hasPrice ? fields.currency : undefined,
    minPriceCents: min,
    maxPriceCents: max,
    locationIds,
    minRooms: fields.minRooms,
    autoSend: fields.autoSend,
  });
}

function sameFields(a: SavedSearchFields, b: SavedSearchFields): boolean {
  const sameList = (x: readonly string[], y: readonly string[]) =>
    x.length === y.length && x.every((item, i) => item === y[i]);
  return (
    a.name === b.name &&
    a.opportunityId === b.opportunityId &&
    a.operation === b.operation &&
    sameList(a.propertyTypes, b.propertyTypes) &&
    a.currency === b.currency &&
    a.minPriceCents === b.minPriceCents &&
    a.maxPriceCents === b.maxPriceCents &&
    sameList(a.locationIds, b.locationIds) &&
    a.minRooms === b.minRooms &&
    a.autoSend === b.autoSend
  );
}

/**
 * Búsqueda guardada de un cliente: los criterios que se cruzan con el stock (`matchesSavedSearch`)
 * y con los que se calcula la coincidencia de una destacada. Se borra a la papelera y se restaura.
 */
export class SavedSearch {
  #state: SavedSearchSnapshot;

  private constructor(state: SavedSearchSnapshot) {
    this.#state = state;
  }

  static create(input: {
    readonly id: SavedSearchId;
    readonly clientId: ClientId;
    readonly fields: SavedSearchFields;
    readonly now: Date;
  }): Result<SavedSearch, InvalidSavedSearchError> {
    const fields = normalize(input.fields);
    if (fields.isErr()) return err(fields.error);
    return ok(
      new SavedSearch({
        ...fields.value,
        id: input.id,
        clientId: input.clientId,
        extraCriteria: {},
        unsubscribedAt: undefined,
        lastMatchedAt: undefined,
        createdAt: input.now,
        updatedAt: input.now,
        deletedAt: undefined,
        deletedBy: undefined,
      }),
    );
  }

  static restore(snapshot: SavedSearchSnapshot): SavedSearch {
    return new SavedSearch(snapshot);
  }

  get id(): SavedSearchId {
    return this.#state.id;
  }

  get clientId(): ClientId {
    return this.#state.clientId;
  }

  get isDeleted(): boolean {
    return this.#state.deletedAt !== undefined;
  }

  get fields(): SavedSearchFields {
    const s = this.#state;
    return {
      name: s.name,
      opportunityId: s.opportunityId,
      operation: s.operation,
      propertyTypes: s.propertyTypes,
      currency: s.currency,
      minPriceCents: s.minPriceCents,
      maxPriceCents: s.maxPriceCents,
      locationIds: s.locationIds,
      minRooms: s.minRooms,
      autoSend: s.autoSend,
    };
  }

  /** Lo que se compara con una propiedad. */
  get criteria(): MatchableSearch {
    const s = this.#state;
    return {
      operation: s.operation,
      propertyTypes: s.propertyTypes,
      currency: s.currency,
      minPriceCents: s.minPriceCents,
      maxPriceCents: s.maxPriceCents,
      locationIds: s.locationIds,
      minRooms: s.minRooms,
    };
  }

  /** Reemplaza los criterios. Devuelve `false` si no cambió nada. */
  edit(
    input: SavedSearchFields,
    now: Date,
  ): Result<boolean, InvalidSavedSearchError | SavedSearchUnsubscribedError> {
    const fields = normalize(input);
    if (fields.isErr()) return err(fields.error);
    if (sameFields(this.fields, fields.value)) return ok(false);
    if (fields.value.autoSend && !this.#state.autoSend && this.#state.unsubscribedAt) {
      return err({ type: 'SavedSearchUnsubscribed' });
    }
    this.#state = { ...this.#state, ...fields.value, updatedAt: now };
    return ok(true);
  }

  /** A la papelera. Devuelve `false` si ya estaba. */
  delete(by: string, now: Date): boolean {
    if (this.isDeleted) return false;
    this.#state = { ...this.#state, deletedAt: now, deletedBy: by, updatedAt: now };
    return true;
  }

  /** Sale de la papelera. Devuelve `false` si no estaba. */
  restore(now: Date): boolean {
    if (!this.isDeleted) return false;
    this.#state = { ...this.#state, deletedAt: undefined, deletedBy: undefined, updatedAt: now };
    return true;
  }

  toSnapshot(): SavedSearchSnapshot {
    return { ...this.#state };
  }
}
