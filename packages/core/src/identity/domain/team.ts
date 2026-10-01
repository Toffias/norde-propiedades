import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { TeamEvent } from './team.events';

export type TeamId = Id<'Team'>;

export interface TeamSnapshot {
  readonly id: TeamId;
  readonly name: string;
  /** Sucursal del equipo, si es de una. */
  readonly branchId: string | undefined;
  readonly deletedAt: Date | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TeamAlreadyDeletedError {
  readonly type: 'TeamAlreadyDeleted';
}
export interface TeamNotDeletedError {
  readonly type: 'TeamNotDeleted';
}
export interface TeamDeletedError {
  readonly type: 'TeamDeleted';
}

const MAX_NAME_LENGTH = 80;

/**
 * Grupo de usuarios (por ejemplo, "Alquileres zona norte"). Los miembros son filas de vínculo que
 * se agregan y quitan de a uno: el equipo no carga la lista entera.
 */
export class Team extends AggregateRoot<TeamId, TeamEvent> {
  #state: Omit<TeamSnapshot, 'id'>;

  private constructor(id: TeamId, state: Omit<TeamSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static create(input: {
    readonly id: TeamId;
    readonly name: string;
    readonly branchId: string | undefined;
    readonly now: Date;
  }): Team {
    const team = new Team(input.id, {
      name: input.name.trim().slice(0, MAX_NAME_LENGTH),
      branchId: input.branchId,
      deletedAt: undefined,
      createdAt: input.now,
      updatedAt: input.now,
    });
    team.record({
      type: 'identity.team_created',
      aggregateId: input.id,
      occurredAt: input.now,
      payload: { teamId: input.id },
    });
    return team;
  }

  static restore(snapshot: TeamSnapshot): Team {
    const { id, ...state } = snapshot;
    return new Team(id, state);
  }

  get name(): string {
    return this.#state.name;
  }

  get isDeleted(): boolean {
    return this.#state.deletedAt !== undefined;
  }

  update(data: { readonly name: string; readonly branchId: string | undefined }, now: Date): void {
    this.#state = {
      ...this.#state,
      name: data.name.trim().slice(0, MAX_NAME_LENGTH),
      branchId: data.branchId,
      updatedAt: now,
    };
  }

  /** Solo un equipo vigente suma o quita miembros. */
  ensureActive(): Result<void, TeamDeletedError> {
    return this.isDeleted ? err({ type: 'TeamDeleted' }) : ok(undefined);
  }

  /** Baja lógica: sus miembros se conservan para poder restaurarlo tal cual. */
  delete(now: Date): Result<void, TeamAlreadyDeletedError> {
    if (this.isDeleted) return err({ type: 'TeamAlreadyDeleted' });
    this.#state = { ...this.#state, deletedAt: now, updatedAt: now };
    this.record({
      type: 'identity.team_deleted',
      aggregateId: this.id,
      occurredAt: now,
      payload: { teamId: this.id },
    });
    return ok(undefined);
  }

  restoreFromTrash(now: Date): Result<void, TeamNotDeletedError> {
    if (!this.isDeleted) return err({ type: 'TeamNotDeleted' });
    this.#state = { ...this.#state, deletedAt: undefined, updatedAt: now };
    this.record({
      type: 'identity.team_restored',
      aggregateId: this.id,
      occurredAt: now,
      payload: { teamId: this.id },
    });
    return ok(undefined);
  }

  toSnapshot(): TeamSnapshot {
    return { id: this.id, ...this.#state };
  }
}
