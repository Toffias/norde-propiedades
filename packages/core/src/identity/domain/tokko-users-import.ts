import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { DomainEvent } from '../../shared/domain/domain-event';
import type { Id } from '../../shared/domain/id';

export type TokkoUsersImportId = Id<'TokkoUsersImport'>;

export const TOKKO_USERS_IMPORT_STATUSES = ['pending', 'running', 'done', 'failed'] as const;
export type TokkoUsersImportStatus = (typeof TOKKO_USERS_IMPORT_STATUSES)[number];

/** Por qué no se pudo copiar: Tokko no respondió o falta el rol Agente o la sucursal principal. */
export const TOKKO_USERS_IMPORT_FAILURES = [
  'tokko_unavailable',
  'agent_role_missing',
  'main_branch_missing',
] as const;
export type TokkoUsersImportFailure = (typeof TOKKO_USERS_IMPORT_FAILURES)[number];

/**
 * Qué pasó con los usuarios de Tokko. `skipped`: sin un email válido para darlo de alta.
 * `unassigned`: "Libre" o "Sin Asignar", que no se copian.
 */
export interface TokkoUsersImportSummary {
  readonly created: number;
  readonly suspended: number;
  readonly existing: number;
  readonly skipped: number;
  readonly unassigned: number;
}

export const NO_TOKKO_USERS_SUMMARY: TokkoUsersImportSummary = {
  created: 0,
  suspended: 0,
  existing: 0,
  skipped: 0,
  unassigned: 0,
};

export interface TokkoUsersImportSnapshot {
  readonly id: TokkoUsersImportId;
  readonly status: TokkoUsersImportStatus;
  readonly summary: TokkoUsersImportSummary;
  readonly failure: TokkoUsersImportFailure | undefined;
  readonly requestedBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly startedAt: Date | undefined;
  readonly finishedAt: Date | undefined;
}

export type TokkoUsersImportRequested = DomainEvent<
  'identity.tokko_users_import_requested',
  { readonly requestId: string }
>;

/**
 * Una corrida de la copia de usuarios de Tokko (#17). Nace pendiente; el job la pone en proceso y
 * la termina con el resumen, o la marca fallida. Queda guardada para que se vea en los procesos en
 * segundo plano del panel.
 */
export class TokkoUsersImport extends AggregateRoot<TokkoUsersImportId, TokkoUsersImportRequested> {
  #state: Omit<TokkoUsersImportSnapshot, 'id'>;

  private constructor(id: TokkoUsersImportId, state: Omit<TokkoUsersImportSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static request(input: {
    readonly id: TokkoUsersImportId;
    readonly requestedBy: string;
    readonly now: Date;
  }): TokkoUsersImport {
    const job = new TokkoUsersImport(input.id, {
      status: 'pending',
      summary: NO_TOKKO_USERS_SUMMARY,
      failure: undefined,
      requestedBy: input.requestedBy,
      createdAt: input.now,
      updatedAt: input.now,
      startedAt: undefined,
      finishedAt: undefined,
    });
    job.record({
      type: 'identity.tokko_users_import_requested',
      aggregateId: input.id,
      occurredAt: input.now,
      // `requestId` es el ID de la corrida: los eventos de antes de guardarla ya lo traían.
      payload: { requestId: input.id },
    });
    return job;
  }

  static restore(snapshot: TokkoUsersImportSnapshot): TokkoUsersImport {
    const { id, ...state } = snapshot;
    return new TokkoUsersImport(id, state);
  }

  get status(): TokkoUsersImportStatus {
    return this.#state.status;
  }

  get summary(): TokkoUsersImportSummary {
    return this.#state.summary;
  }

  get isFinished(): boolean {
    return this.#state.status === 'done' || this.#state.status === 'failed';
  }

  /** La pone en proceso. Una que quedó en proceso (el job se cortó) se vuelve a correr entera. */
  start(now: Date): void {
    if (this.#state.status !== 'pending') return;
    this.#state = { ...this.#state, status: 'running', startedAt: now, updatedAt: now };
  }

  finish(summary: TokkoUsersImportSummary, now: Date): void {
    this.#state = { ...this.#state, status: 'done', summary, finishedAt: now, updatedAt: now };
  }

  fail(failure: TokkoUsersImportFailure, now: Date): void {
    this.#state = { ...this.#state, status: 'failed', failure, finishedAt: now, updatedAt: now };
  }

  toSnapshot(): TokkoUsersImportSnapshot {
    return { id: this.id, ...this.#state };
  }
}
