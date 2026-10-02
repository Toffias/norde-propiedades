import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import { isOpenStatus, OPPORTUNITY_STATUSES, type OpportunityStatus } from './opportunity-status';

export type OpportunityStageId = Id<'OpportunityStage'>;

/** Tope de estados editables: cada uno es una columna del tablero. */
export const MAX_OPPORTUNITY_STAGES = 30;

const MAX_NAME_LENGTH = 40;

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
}

/** Lo que una oportunidad necesita saber del estado al que pasa. */
export interface StageRef {
  readonly id: OpportunityStageId;
  readonly category: OpportunityStatus;
  readonly isActive: boolean;
}

export interface OpportunityStageSnapshot {
  readonly id: OpportunityStageId;
  readonly name: string;
  /** `#rrggbb`, validado en el contract. */
  readonly color: string;
  readonly position: number;
  readonly category: OpportunityStatus;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TooManyStagesError {
  readonly type: 'TooManyStages';
  readonly max: number;
}

/** Cada categoría conserva al menos un estado activo: si no, ninguna oportunidad podría llegar. */
export interface LastActiveStageError {
  readonly type: 'LastActiveStage';
  readonly category: OpportunityStatus;
}

/** Un estado que usa una regla automática no se desactiva: primero se cambia la regla. */
export interface StageUsedByRuleError {
  readonly type: 'StageUsedByRule';
}

export interface InvalidOrderError {
  readonly type: 'InvalidOrder';
}

/**
 * Estado de oportunidad que edita Norde (ADR 0013): nombre, color y orden. Pertenece a una
 * categoría fija del dominio, que no cambia: las oportunidades que lo tienen guardan esa
 * categoría. Un estado no se borra: se desactiva.
 */
export class OpportunityStage extends AggregateRoot<OpportunityStageId, never> {
  #state: Omit<OpportunityStageSnapshot, 'id'>;

  private constructor(id: OpportunityStageId, state: Omit<OpportunityStageSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static create(input: {
    readonly id: OpportunityStageId;
    readonly name: string;
    readonly color: string;
    readonly category: OpportunityStatus;
    readonly existingCount: number;
    readonly now: Date;
  }): Result<OpportunityStage, TooManyStagesError> {
    if (input.existingCount >= MAX_OPPORTUNITY_STAGES) {
      return err({ type: 'TooManyStages', max: MAX_OPPORTUNITY_STAGES });
    }
    return ok(
      new OpportunityStage(input.id, {
        name: cleanName(input.name),
        color: input.color.toLowerCase(),
        position: input.existingCount,
        category: input.category,
        isActive: true,
        createdAt: input.now,
        updatedAt: input.now,
      }),
    );
  }

  static restore(snapshot: OpportunityStageSnapshot): OpportunityStage {
    const { id, ...state } = snapshot;
    return new OpportunityStage(id, state);
  }

  get name(): string {
    return this.#state.name;
  }

  get category(): OpportunityStatus {
    return this.#state.category;
  }

  get isActive(): boolean {
    return this.#state.isActive;
  }

  get position(): number {
    return this.#state.position;
  }

  ref(): StageRef {
    return { id: this.id, category: this.#state.category, isActive: this.#state.isActive };
  }

  /** Renombrar o recolorear. Devuelve si cambió algo. */
  update(data: { readonly name: string; readonly color: string }, now: Date): boolean {
    const name = cleanName(data.name);
    const color = data.color.toLowerCase();
    if (name === this.#state.name && color === this.#state.color) return false;
    this.#state = { ...this.#state, name, color, updatedAt: now };
    return true;
  }

  moveTo(position: number, now: Date): boolean {
    if (position === this.#state.position) return false;
    this.#state = { ...this.#state, position, updatedAt: now };
    return true;
  }

  /**
   * `activeInCategory`: cuántos estados activos tiene su categoría, este incluido.
   * `usedByRule`: si alguna regla automática lo elige.
   */
  deactivate(
    context: { readonly activeInCategory: number; readonly usedByRule: boolean },
    now: Date,
  ): Result<boolean, LastActiveStageError | StageUsedByRuleError> {
    if (!this.#state.isActive) return ok(false);
    if (context.activeInCategory <= 1) {
      return err({ type: 'LastActiveStage', category: this.#state.category });
    }
    if (context.usedByRule) return err({ type: 'StageUsedByRule' });
    this.#state = { ...this.#state, isActive: false, updatedAt: now };
    return ok(true);
  }

  reactivate(now: Date): boolean {
    if (this.#state.isActive) return false;
    this.#state = { ...this.#state, isActive: true, updatedAt: now };
    return true;
  }

  toSnapshot(): OpportunityStageSnapshot {
    return { id: this.id, ...this.#state };
  }
}

interface Positioned {
  readonly id: string;
  moveTo(position: number, now: Date): boolean;
}

/**
 * Aplica un orden nuevo a un catálogo (estados o motivos de cierre): `orderedIds` tiene que traer
 * todos los elementos, una vez cada uno. Devuelve los que cambiaron de posición.
 */
export function applyOrder<T extends Positioned>(
  items: readonly T[],
  orderedIds: readonly string[],
  now: Date,
): Result<T[], InvalidOrderError> {
  const byId = new Map<string, T>(items.map((item) => [item.id, item]));
  if (orderedIds.length !== items.length || new Set(orderedIds).size !== orderedIds.length) {
    return err({ type: 'InvalidOrder' });
  }
  if (orderedIds.some((id) => !byId.has(id))) return err({ type: 'InvalidOrder' });
  const changed: T[] = [];
  for (const [position, id] of orderedIds.entries()) {
    const item = byId.get(id);
    if (item?.moveTo(position, now)) changed.push(item);
  }
  return ok(changed);
}

/** El primer estado activo de la categoría, por posición. */
export function firstActiveStageOf(
  stages: readonly OpportunityStage[],
  category: OpportunityStatus,
): OpportunityStage | undefined {
  return [...stages]
    .filter((s) => s.isActive && s.category === category)
    .sort((a, b) => a.position - b.position)[0];
}

/** Las categorías en las que puede nacer o quedar una oportunidad abierta. */
export const OPEN_STAGE_CATEGORIES: readonly OpportunityStatus[] =
  OPPORTUNITY_STATUSES.filter(isOpenStatus);
