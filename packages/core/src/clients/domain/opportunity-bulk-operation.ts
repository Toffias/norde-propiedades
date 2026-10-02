import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { DomainEvent } from '../../shared/domain/domain-event';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

// Acción masiva sobre oportunidades que supera lo que se hace en el request: queda registrada y un
// job la procesa por lotes, con los permisos de quien la pidió.

export type OpportunityBulkOperationId = Id<'OpportunityBulkOperation'>;

/** Hasta cuántas se cambian en el mismo request; más que eso va como job. */
export const BULK_SYNC_LIMIT = 100;
/** Cuántas puede tocar una acción masiva como mucho. */
export const MAX_BULK_OPPORTUNITIES = 2000;
/** El detalle de las que no se pudieron cambiar se corta acá; el total sí se informa. */
export const MAX_BULK_SKIPPED_DETAIL = 20;

/** Qué se hace con cada oportunidad de la selección. */
export type OpportunityBulkAction =
  | { readonly kind: 'change_stage'; readonly stageId: string }
  | { readonly kind: 'close'; readonly closeReasonId: string }
  | { readonly kind: 'reassign'; readonly agentId: string | null };

/**
 * Las marcadas (por ID) o todas las que cumplen el filtro del pipeline. El filtro se guarda tal
 * como llegó y se vuelve a validar al procesar: la visibilidad sale de los permisos de ese momento.
 */
export type OpportunityBulkSelection =
  | { readonly kind: 'ids'; readonly ids: readonly string[] }
  | { readonly kind: 'filter'; readonly filter: Readonly<Record<string, string>> };

export const OPPORTUNITY_BULK_SKIP_REASONS = [
  'not_found',
  'forbidden',
  'closed',
  'invalid_transition',
] as const;
export type OpportunityBulkSkipReason = (typeof OPPORTUNITY_BULK_SKIP_REASONS)[number];

export interface OpportunityBulkSkipped {
  readonly opportunityId: string;
  readonly reason: OpportunityBulkSkipReason;
}

export interface OpportunityBulkTotals {
  /** Las que cumplían la selección al pedirla. */
  readonly total: number;
  readonly processed: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly skippedCount: number;
  /** Las primeras `MAX_BULK_SKIPPED_DETAIL` que no se pudieron cambiar. */
  readonly skipped: readonly OpportunityBulkSkipped[];
}

/** Lo que dejó un lote: se suma a la operación en la misma transacción que los cambios. */
export interface OpportunityBulkBatch {
  readonly processed: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly skipped: readonly OpportunityBulkSkipped[];
  /** La última oportunidad del lote (por ID): de ahí sigue el próximo. */
  readonly lastId: string | undefined;
}

export const OPPORTUNITY_BULK_STATUSES = ['pending', 'running', 'done', 'failed'] as const;
export type OpportunityBulkStatus = (typeof OPPORTUNITY_BULK_STATUSES)[number];

/** Por qué no se pudo procesar entera. */
export const OPPORTUNITY_BULK_FAILURES = ['requester_unavailable', 'invalid_request'] as const;
export type OpportunityBulkFailure = (typeof OPPORTUNITY_BULK_FAILURES)[number];

export interface OpportunityBulkOperationSnapshot {
  readonly id: OpportunityBulkOperationId;
  readonly action: OpportunityBulkAction;
  readonly selection: OpportunityBulkSelection;
  readonly status: OpportunityBulkStatus;
  readonly totals: OpportunityBulkTotals;
  /** Hasta dónde llegó (por ID): si el job se corta, retoma desde acá. */
  readonly cursor: string | undefined;
  readonly failure: OpportunityBulkFailure | undefined;
  readonly requestedBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly startedAt: Date | undefined;
  readonly finishedAt: Date | undefined;
}

export type OpportunityBulkRequested = DomainEvent<
  'clients.opportunity_bulk_requested',
  { readonly operationId: string }
>;

export interface TooManyOpportunitiesError {
  readonly type: 'TooManyOpportunities';
  readonly max: number;
  readonly total: number;
}

export interface BulkOperationFinishedError {
  readonly type: 'BulkOperationFinished';
}

/** Suma un lote a los totales, con el detalle de omitidas cortado en `MAX_BULK_SKIPPED_DETAIL`. */
export function addBulkBatch(
  totals: OpportunityBulkTotals,
  batch: OpportunityBulkBatch,
): OpportunityBulkTotals {
  return {
    total: totals.total,
    processed: totals.processed + batch.processed,
    updated: totals.updated + batch.updated,
    unchanged: totals.unchanged + batch.unchanged,
    skippedCount: totals.skippedCount + batch.skipped.length,
    skipped: [...totals.skipped, ...batch.skipped].slice(0, MAX_BULK_SKIPPED_DETAIL),
  };
}

export function emptyBulkTotals(total: number): OpportunityBulkTotals {
  return { total, processed: 0, updated: 0, unchanged: 0, skippedCount: 0, skipped: [] };
}

/** Una selección puede tocar como mucho `MAX_BULK_OPPORTUNITIES`. */
export function checkBulkSize(total: number): Result<number, TooManyOpportunitiesError> {
  return total > MAX_BULK_OPPORTUNITIES
    ? err({ type: 'TooManyOpportunities', max: MAX_BULK_OPPORTUNITIES, total })
    : ok(total);
}

/** Hasta `BULK_SYNC_LIMIT` se hace en el request; más, como job. */
export function runsAsJob(total: number): boolean {
  return total > BULK_SYNC_LIMIT;
}

/**
 * Una acción masiva encolada. Nace pendiente; el job la pone en proceso, suma cada lote (con su
 * cursor) y la termina. Si el job se corta, retoma desde el último lote guardado.
 */
export class OpportunityBulkOperation extends AggregateRoot<
  OpportunityBulkOperationId,
  OpportunityBulkRequested
> {
  #state: Omit<OpportunityBulkOperationSnapshot, 'id'>;

  private constructor(
    id: OpportunityBulkOperationId,
    state: Omit<OpportunityBulkOperationSnapshot, 'id'>,
  ) {
    super(id);
    this.#state = state;
  }

  static request(input: {
    readonly id: OpportunityBulkOperationId;
    readonly action: OpportunityBulkAction;
    readonly selection: OpportunityBulkSelection;
    readonly total: number;
    readonly requestedBy: string;
    readonly now: Date;
  }): Result<OpportunityBulkOperation, TooManyOpportunitiesError> {
    const size = checkBulkSize(input.total);
    if (size.isErr()) return err(size.error);
    const operation = new OpportunityBulkOperation(input.id, {
      action: input.action,
      selection: input.selection,
      status: 'pending',
      totals: emptyBulkTotals(input.total),
      cursor: undefined,
      failure: undefined,
      requestedBy: input.requestedBy,
      createdAt: input.now,
      updatedAt: input.now,
      startedAt: undefined,
      finishedAt: undefined,
    });
    operation.record({
      type: 'clients.opportunity_bulk_requested',
      aggregateId: input.id,
      occurredAt: input.now,
      payload: { operationId: input.id },
    });
    return ok(operation);
  }

  static restore(snapshot: OpportunityBulkOperationSnapshot): OpportunityBulkOperation {
    const { id, ...state } = snapshot;
    return new OpportunityBulkOperation(id, state);
  }

  get action(): OpportunityBulkAction {
    return this.#state.action;
  }

  get selection(): OpportunityBulkSelection {
    return this.#state.selection;
  }

  get status(): OpportunityBulkStatus {
    return this.#state.status;
  }

  get totals(): OpportunityBulkTotals {
    return this.#state.totals;
  }

  get cursor(): string | undefined {
    return this.#state.cursor;
  }

  get requestedBy(): string {
    return this.#state.requestedBy;
  }

  get isFinished(): boolean {
    return this.#state.status === 'done' || this.#state.status === 'failed';
  }

  /** Cuántas faltan procesar de las que había al pedirla. */
  get remaining(): number {
    return Math.max(0, this.#state.totals.total - this.#state.totals.processed);
  }

  /** La pone en proceso. Una que quedó en proceso (el job se cortó) se retoma. */
  start(now: Date): Result<void, BulkOperationFinishedError> {
    if (this.isFinished) return err({ type: 'BulkOperationFinished' });
    if (this.#state.status === 'pending') {
      this.#state = { ...this.#state, status: 'running', startedAt: now, updatedAt: now };
    }
    return ok(undefined);
  }

  recordBatch(batch: OpportunityBulkBatch, now: Date): void {
    this.#state = {
      ...this.#state,
      totals: addBulkBatch(this.#state.totals, batch),
      cursor: batch.lastId ?? this.#state.cursor,
      updatedAt: now,
    };
  }

  finish(now: Date): void {
    this.#state = { ...this.#state, status: 'done', finishedAt: now, updatedAt: now };
  }

  fail(failure: OpportunityBulkFailure, now: Date): void {
    this.#state = { ...this.#state, status: 'failed', failure, finishedAt: now, updatedAt: now };
  }

  toSnapshot(): OpportunityBulkOperationSnapshot {
    return { id: this.id, ...this.#state };
  }
}
