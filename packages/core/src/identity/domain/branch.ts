import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';
import type { Email } from '../../shared/domain/value-objects/email';
import type { Phone } from '../../shared/domain/value-objects/phone';

import type { BranchEvent } from './branch.events';

export type BranchId = Id<'Branch'>;

/** Datos de contacto de la sucursal: se usan en los portales y en las fichas en PDF. */
export interface BranchContact {
  readonly name: string;
  readonly logoUrl: string | undefined;
  readonly address: string | undefined;
  readonly email: Email | undefined;
  readonly phone: Phone | undefined;
  readonly whatsapp: Phone | undefined;
}

export interface BranchSnapshot extends BranchContact {
  readonly id: BranchId;
  /** La casa central. Siempre hay una sola (la primera sucursal lo es). */
  readonly isMain: boolean;
  readonly deletedAt: Date | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MainBranchCannotBeDeletedError {
  readonly type: 'MainBranchCannotBeDeleted';
}
export interface BranchHasMembersError {
  readonly type: 'BranchHasMembers';
  readonly userCount: number;
}
export interface BranchHasTeamsError {
  readonly type: 'BranchHasTeams';
  readonly teamCount: number;
}
export interface BranchAlreadyDeletedError {
  readonly type: 'BranchAlreadyDeleted';
}
export interface BranchNotDeletedError {
  readonly type: 'BranchNotDeleted';
}

const MAX_NAME_LENGTH = 80;

function clean(contact: BranchContact): BranchContact {
  const address = contact.address?.trim();
  return {
    ...contact,
    name: contact.name.trim().slice(0, MAX_NAME_LENGTH),
    address: address === '' ? undefined : address,
  };
}

/** Sucursal de Norde. Hoy hay una sola, pero se modela para poder abrir otras. */
export class Branch extends AggregateRoot<BranchId, BranchEvent> {
  #state: Omit<BranchSnapshot, 'id'>;

  private constructor(id: BranchId, state: Omit<BranchSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  /** La primera sucursal (cuando no hay otra principal) es la casa central. */
  static create(
    input: BranchContact & { readonly id: BranchId; readonly isFirst: boolean; readonly now: Date },
  ): Branch {
    const { id, isFirst, now, ...contact } = input;
    const branch = new Branch(id, {
      ...clean(contact),
      isMain: isFirst,
      deletedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });
    branch.record({
      type: 'identity.branch_created',
      aggregateId: id,
      occurredAt: now,
      payload: { branchId: id },
    });
    return branch;
  }

  static restore(snapshot: BranchSnapshot): Branch {
    const { id, ...state } = snapshot;
    return new Branch(id, state);
  }

  get name(): string {
    return this.#state.name;
  }

  get isMain(): boolean {
    return this.#state.isMain;
  }

  get isDeleted(): boolean {
    return this.#state.deletedAt !== undefined;
  }

  update(contact: BranchContact, now: Date): void {
    this.#state = { ...this.#state, ...clean(contact), updatedAt: now };
  }

  /** Pasa a ser la casa central. El caso de uso le saca la marca a la anterior. */
  makeMain(now: Date): void {
    if (this.#state.isMain) return;
    this.#state = { ...this.#state, isMain: true, updatedAt: now };
    this.record({
      type: 'identity.branch_made_main',
      aggregateId: this.id,
      occurredAt: now,
      payload: { branchId: this.id },
    });
  }

  stopBeingMain(now: Date): void {
    this.#state = { ...this.#state, isMain: false, updatedAt: now };
  }

  /**
   * Baja lógica. No se borra la casa central (siempre tiene que haber una), ni una sucursal con
   * usuarios o equipos: hay que moverlos antes.
   */
  delete(
    usage: { readonly userCount: number; readonly teamCount: number },
    now: Date,
  ): Result<
    void,
    | MainBranchCannotBeDeletedError
    | BranchHasMembersError
    | BranchHasTeamsError
    | BranchAlreadyDeletedError
  > {
    if (this.isDeleted) return err({ type: 'BranchAlreadyDeleted' });
    if (this.#state.isMain) return err({ type: 'MainBranchCannotBeDeleted' });
    if (usage.userCount > 0) return err({ type: 'BranchHasMembers', userCount: usage.userCount });
    if (usage.teamCount > 0) return err({ type: 'BranchHasTeams', teamCount: usage.teamCount });

    this.#state = { ...this.#state, deletedAt: now, updatedAt: now };
    this.record({
      type: 'identity.branch_deleted',
      aggregateId: this.id,
      occurredAt: now,
      payload: { branchId: this.id },
    });
    return ok(undefined);
  }

  restoreFromTrash(now: Date): Result<void, BranchNotDeletedError> {
    if (!this.isDeleted) return err({ type: 'BranchNotDeleted' });
    this.#state = { ...this.#state, deletedAt: undefined, updatedAt: now };
    this.record({
      type: 'identity.branch_restored',
      aggregateId: this.id,
      occurredAt: now,
      payload: { branchId: this.id },
    });
    return ok(undefined);
  }

  toSnapshot(): BranchSnapshot {
    return { id: this.id, ...this.#state };
  }
}
