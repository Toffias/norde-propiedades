import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { AppraisalEvent } from './appraisal.events';
import {
  canAppraisalTransition,
  type AppraisalStatus,
  type ManualAppraisalStatus,
} from './appraisal-status';
import type {
  AppraisalCondition,
  AppraisalPropertyType,
  AppraisalSource,
} from './appraisal-values';

export type AppraisalId = Id<'Appraisal'>;

/** Prefijo del código de las tasaciones (`TAS0001`). */
export const APPRAISAL_CODE_PREFIX = 'TAS';
const CODE_DIGITS = 4;

/** El código visible de la tasación número `n` de la secuencia: `TAS0001`, `TAS12345`. */
export function appraisalCode(n: number): string {
  return `${APPRAISAL_CODE_PREFIX}${String(n).padStart(CODE_DIGITS, '0')}`;
}

/** Los datos de la propiedad a tasar. */
export interface AppraisalPropertyData {
  readonly propertyType: AppraisalPropertyType;
  readonly address: string | undefined;
  /** Metros cuadrados, con hasta dos decimales. */
  readonly surfaceTotalM2: number | undefined;
  readonly surfaceCoveredM2: number | undefined;
  readonly rooms: number | undefined;
  readonly bedrooms: number | undefined;
  readonly bathrooms: number | undefined;
  readonly condition: AppraisalCondition | undefined;
}

/** Lo que se carga y se edita de una tasación. */
export interface AppraisalDetails extends AppraisalPropertyData {
  /** Cliente propietario que la pide: del módulo clients, solo por ID. */
  readonly requesterClientId: string;
  /** Quien trae la tasación: usuario de identity, solo por ID. */
  readonly producerUserId: string;
  /** Sucursal del productor: de identity, solo por ID. */
  readonly branchId: string | undefined;
  /** Quien la hace (opcional hasta asignarlo): usuario de identity, solo por ID. */
  readonly appraiserUserId: string | undefined;
  /** Día y hora de la visita. */
  readonly visitAt: Date | undefined;
}

export interface AppraisalSnapshot extends AppraisalDetails {
  readonly id: AppraisalId;
  readonly code: string;
  readonly source: AppraisalSource;
  readonly status: AppraisalStatus;
  readonly statusChangedAt: Date | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | undefined;
  readonly deletedBy: string | undefined;
}

export interface NewAppraisal extends AppraisalDetails {
  readonly id: AppraisalId;
  readonly code: string;
  readonly source: AppraisalSource;
  readonly now: Date;
}

export interface NegativeAppraisalMeasureError {
  readonly type: 'NegativeAppraisalMeasure';
}
/** Para agendar la visita hace falta su fecha; con la visita agendada, no se puede borrar. */
export interface VisitDateRequiredError {
  readonly type: 'VisitDateRequired';
}
/** Una tasación convertida en propiedad ya no se edita ni cambia de estado. */
export interface AppraisalConvertedError {
  readonly type: 'AppraisalConverted';
}
export interface AppraisalDeletedError {
  readonly type: 'AppraisalDeleted';
}
export interface InvalidAppraisalTransitionError {
  readonly type: 'InvalidAppraisalTransition';
  readonly from: AppraisalStatus;
  readonly to: AppraisalStatus;
}
export interface AppraisalAlreadyDeletedError {
  readonly type: 'AppraisalAlreadyDeleted';
}
export interface AppraisalNotDeletedError {
  readonly type: 'AppraisalNotDeleted';
}

export type InvalidAppraisalDetailsError = NegativeAppraisalMeasureError;

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

function cleanDetails(
  details: AppraisalDetails,
): Result<AppraisalDetails, InvalidAppraisalDetailsError> {
  const measures = [
    details.surfaceTotalM2,
    details.surfaceCoveredM2,
    details.rooms,
    details.bedrooms,
    details.bathrooms,
  ];
  if (measures.some((value) => value !== undefined && value < 0)) {
    return err({ type: 'NegativeAppraisalMeasure' });
  }
  return ok({
    requesterClientId: details.requesterClientId,
    producerUserId: details.producerUserId,
    branchId: details.branchId,
    appraiserUserId: details.appraiserUserId,
    visitAt: details.visitAt,
    propertyType: details.propertyType,
    address: optionalText(details.address),
    surfaceTotalM2: details.surfaceTotalM2,
    surfaceCoveredM2: details.surfaceCoveredM2,
    rooms: details.rooms,
    bedrooms: details.bedrooms,
    bathrooms: details.bathrooms,
    condition: details.condition,
  });
}

const DETAIL_FIELDS = [
  'requesterClientId',
  'producerUserId',
  'branchId',
  'appraiserUserId',
  'propertyType',
  'address',
  'surfaceTotalM2',
  'surfaceCoveredM2',
  'rooms',
  'bedrooms',
  'bathrooms',
  'condition',
] as const satisfies readonly (keyof AppraisalDetails)[];

function sameDetails(a: AppraisalDetails, b: AppraisalDetails): boolean {
  return (
    DETAIL_FIELDS.every((field) => a[field] === b[field]) &&
    a.visitAt?.getTime() === b.visitAt?.getTime()
  );
}

/**
 * Tasación de una propiedad que un cliente propietario quiere vender o alquilar. Nace solicitada,
 * se agenda la visita, se tasa y, si Norde consigue la propiedad, se convierte en una captación.
 * Se puede descartar en cualquier momento antes de convertirse, y reabrir después.
 */
export class Appraisal extends AggregateRoot<AppraisalId, AppraisalEvent> {
  #state: Omit<AppraisalSnapshot, 'id'>;

  private constructor(id: AppraisalId, state: Omit<AppraisalSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static create(input: NewAppraisal): Result<Appraisal, InvalidAppraisalDetailsError> {
    const details = cleanDetails(input);
    if (details.isErr()) return err(details.error);
    const appraisal = new Appraisal(input.id, {
      ...details.value,
      code: input.code,
      source: input.source,
      status: 'requested',
      statusChangedAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: undefined,
      deletedBy: undefined,
    });
    appraisal.record({
      type: 'appraisals.appraisal_requested',
      aggregateId: input.id,
      occurredAt: input.now,
      payload: appraisal.#payload(),
    });
    return ok(appraisal);
  }

  static restore(snapshot: AppraisalSnapshot): Appraisal {
    const { id, ...state } = snapshot;
    return new Appraisal(id, state);
  }

  get code(): string {
    return this.#state.code;
  }

  get status(): AppraisalStatus {
    return this.#state.status;
  }

  get requesterClientId(): string {
    return this.#state.requesterClientId;
  }

  get producerUserId(): string {
    return this.#state.producerUserId;
  }

  get appraiserUserId(): string | undefined {
    return this.#state.appraiserUserId;
  }

  get branchId(): string | undefined {
    return this.#state.branchId;
  }

  get isDeleted(): boolean {
    return this.#state.deletedAt !== undefined;
  }

  /** Cambia los datos. Devuelve `false` si no cambió nada. */
  update(
    details: AppraisalDetails,
    now: Date,
  ): Result<
    boolean,
    | AppraisalDeletedError
    | AppraisalConvertedError
    | VisitDateRequiredError
    | InvalidAppraisalDetailsError
  > {
    const editable = this.#checkEditable();
    if (editable.isErr()) return err(editable.error);
    const cleaned = cleanDetails(details);
    if (cleaned.isErr()) return err(cleaned.error);
    if (this.#state.status === 'visit_scheduled' && cleaned.value.visitAt === undefined) {
      return err({ type: 'VisitDateRequired' });
    }
    if (sameDetails(this.#state, cleaned.value)) return ok(false);
    this.#state = { ...this.#state, ...cleaned.value, updatedAt: now };
    this.record({
      type: 'appraisals.appraisal_updated',
      aggregateId: this.id,
      occurredAt: now,
      payload: this.#payload(),
    });
    return ok(true);
  }

  /** Cambia el estado a mano. Devuelve `false` si ya estaba en ese estado. */
  changeStatus(
    to: ManualAppraisalStatus,
    now: Date,
  ): Result<
    boolean,
    | AppraisalDeletedError
    | AppraisalConvertedError
    | InvalidAppraisalTransitionError
    | VisitDateRequiredError
  > {
    const editable = this.#checkEditable();
    if (editable.isErr()) return err(editable.error);
    const from = this.#state.status;
    if (from === to) return ok(false);
    if (!canAppraisalTransition(from, to)) {
      return err({ type: 'InvalidAppraisalTransition', from, to });
    }
    if (to === 'visit_scheduled' && this.#state.visitAt === undefined) {
      return err({ type: 'VisitDateRequired' });
    }
    this.#state = { ...this.#state, status: to, statusChangedAt: now, updatedAt: now };
    this.record({
      type: 'appraisals.appraisal_status_changed',
      aggregateId: this.id,
      occurredAt: now,
      payload: { ...this.#payload(), from, to },
    });
    return ok(true);
  }

  /** Baja lógica: va a la papelera con quién la borró y cuándo. */
  delete(by: string, now: Date): Result<void, AppraisalAlreadyDeletedError> {
    if (this.isDeleted) return err({ type: 'AppraisalAlreadyDeleted' });
    this.#state = { ...this.#state, deletedAt: now, deletedBy: by, updatedAt: now };
    this.record({
      type: 'appraisals.appraisal_deleted',
      aggregateId: this.id,
      occurredAt: now,
      payload: this.#payload(),
    });
    return ok(undefined);
  }

  restoreFromTrash(now: Date): Result<void, AppraisalNotDeletedError> {
    if (!this.isDeleted) return err({ type: 'AppraisalNotDeleted' });
    this.#state = { ...this.#state, deletedAt: undefined, deletedBy: undefined, updatedAt: now };
    this.record({
      type: 'appraisals.appraisal_restored',
      aggregateId: this.id,
      occurredAt: now,
      payload: this.#payload(),
    });
    return ok(undefined);
  }

  toSnapshot(): AppraisalSnapshot {
    return { id: this.id, ...this.#state };
  }

  #checkEditable(): Result<void, AppraisalDeletedError | AppraisalConvertedError> {
    if (this.isDeleted) return err({ type: 'AppraisalDeleted' });
    if (this.#state.status === 'converted') return err({ type: 'AppraisalConverted' });
    return ok(undefined);
  }

  #payload(): { appraisalId: string; requesterClientId: string } {
    return { appraisalId: this.id, requesterClientId: this.#state.requesterClientId };
  }
}
