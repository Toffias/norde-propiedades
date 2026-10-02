import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { OpportunityStatus } from './opportunity-status';

export type OpportunityCloseReasonId = Id<'OpportunityCloseReason'>;

/** Tope de motivos de cierre: se eligen de una lista al cerrar. */
export const MAX_CLOSE_REASONS = 50;

export const CLOSE_REASON_RATINGS = ['positive', 'negative', 'neutral'] as const;
export type CloseReasonRating = (typeof CLOSE_REASON_RATINGS)[number];

const MAX_NAME_LENGTH = 80;

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
}

/** La calificación del motivo decide cómo termina: positiva = ganada; el resto, perdida. */
export function closingStatusFor(rating: CloseReasonRating): OpportunityStatus {
  return rating === 'positive' ? 'won' : 'lost';
}

/** Lo que una oportunidad necesita saber del motivo con el que se cierra. */
export interface CloseReasonRef {
  readonly id: OpportunityCloseReasonId;
  readonly rating: CloseReasonRating;
  readonly isActive: boolean;
}

export interface OpportunityCloseReasonSnapshot {
  readonly id: OpportunityCloseReasonId;
  readonly name: string;
  readonly rating: CloseReasonRating;
  readonly position: number;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TooManyCloseReasonsError {
  readonly type: 'TooManyCloseReasons';
  readonly max: number;
}

/** Sin motivos activos no se podría cerrar ninguna oportunidad. */
export interface LastActiveCloseReasonError {
  readonly type: 'LastActiveCloseReason';
}

/** Motivo de cierre de una oportunidad ("Compró con nosotros", "Dejó de buscar"). */
export class OpportunityCloseReason extends AggregateRoot<OpportunityCloseReasonId, never> {
  #state: Omit<OpportunityCloseReasonSnapshot, 'id'>;

  private constructor(
    id: OpportunityCloseReasonId,
    state: Omit<OpportunityCloseReasonSnapshot, 'id'>,
  ) {
    super(id);
    this.#state = state;
  }

  static create(input: {
    readonly id: OpportunityCloseReasonId;
    readonly name: string;
    readonly rating: CloseReasonRating;
    readonly existingCount: number;
    readonly now: Date;
  }): Result<OpportunityCloseReason, TooManyCloseReasonsError> {
    if (input.existingCount >= MAX_CLOSE_REASONS) {
      return err({ type: 'TooManyCloseReasons', max: MAX_CLOSE_REASONS });
    }
    return ok(
      new OpportunityCloseReason(input.id, {
        name: cleanName(input.name),
        rating: input.rating,
        position: input.existingCount,
        isActive: true,
        createdAt: input.now,
        updatedAt: input.now,
      }),
    );
  }

  static restore(snapshot: OpportunityCloseReasonSnapshot): OpportunityCloseReason {
    const { id, ...state } = snapshot;
    return new OpportunityCloseReason(id, state);
  }

  get name(): string {
    return this.#state.name;
  }

  get rating(): CloseReasonRating {
    return this.#state.rating;
  }

  get isActive(): boolean {
    return this.#state.isActive;
  }

  ref(): CloseReasonRef {
    return { id: this.id, rating: this.#state.rating, isActive: this.#state.isActive };
  }

  /**
   * Renombrar o cambiar la calificación. Las oportunidades ya cerradas conservan su resultado:
   * la calificación solo decide cómo terminan las próximas. Devuelve si cambió algo.
   */
  update(data: { readonly name: string; readonly rating: CloseReasonRating }, now: Date): boolean {
    const name = cleanName(data.name);
    if (name === this.#state.name && data.rating === this.#state.rating) return false;
    this.#state = { ...this.#state, name, rating: data.rating, updatedAt: now };
    return true;
  }

  moveTo(position: number, now: Date): boolean {
    if (position === this.#state.position) return false;
    this.#state = { ...this.#state, position, updatedAt: now };
    return true;
  }

  /** `activeCount`: cuántos motivos activos hay, este incluido. */
  deactivate(activeCount: number, now: Date): Result<boolean, LastActiveCloseReasonError> {
    if (!this.#state.isActive) return ok(false);
    if (activeCount <= 1) return err({ type: 'LastActiveCloseReason' });
    this.#state = { ...this.#state, isActive: false, updatedAt: now };
    return ok(true);
  }

  reactivate(now: Date): boolean {
    if (this.#state.isActive) return false;
    this.#state = { ...this.#state, isActive: true, updatedAt: now };
    return true;
  }

  toSnapshot(): OpportunityCloseReasonSnapshot {
    return { id: this.id, ...this.#state };
  }
}
