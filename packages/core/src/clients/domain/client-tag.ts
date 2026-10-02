import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';

export type ClientTagGroupId = Id<'ClientTagGroup'>;
export type ClientTagId = Id<'ClientTag'>;

/** Tope de etiquetas por contacto: más deja de servir como filtro. */
export const MAX_CLIENT_TAGS = 50;

const MAX_NAME_LENGTH = 60;

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
}

export interface ClientTagGroupSnapshot {
  readonly id: ClientTagGroupId;
  readonly name: string;
  readonly position: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Grupo de etiquetas de contactos ("Origen", "Alquileres", "Colegas"). */
export class ClientTagGroup extends AggregateRoot<ClientTagGroupId, never> {
  #state: Omit<ClientTagGroupSnapshot, 'id'>;

  private constructor(id: ClientTagGroupId, state: Omit<ClientTagGroupSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static create(input: {
    readonly id: ClientTagGroupId;
    readonly name: string;
    readonly position: number;
    readonly now: Date;
  }): ClientTagGroup {
    return new ClientTagGroup(input.id, {
      name: cleanName(input.name),
      position: input.position,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static restore(snapshot: ClientTagGroupSnapshot): ClientTagGroup {
    const { id, ...state } = snapshot;
    return new ClientTagGroup(id, state);
  }

  get name(): string {
    return this.#state.name;
  }

  rename(name: string, now: Date): void {
    this.#state = { ...this.#state, name: cleanName(name), updatedAt: now };
  }

  toSnapshot(): ClientTagGroupSnapshot {
    return { id: this.id, ...this.#state };
  }
}

export interface ClientTagSnapshot {
  readonly id: ClientTagId;
  /** Sin grupo: etiqueta suelta. */
  readonly groupId: ClientTagGroupId | undefined;
  readonly name: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Etiqueta de contactos: ordena la agenda y sirve de filtro. El nombre no se repite dentro de su
 * grupo (sin distinguir mayúsculas).
 */
export class ClientTag extends AggregateRoot<ClientTagId, never> {
  #state: Omit<ClientTagSnapshot, 'id'>;

  private constructor(id: ClientTagId, state: Omit<ClientTagSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static create(input: {
    readonly id: ClientTagId;
    readonly groupId: ClientTagGroupId | undefined;
    readonly name: string;
    readonly now: Date;
  }): ClientTag {
    return new ClientTag(input.id, {
      groupId: input.groupId,
      name: cleanName(input.name),
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static restore(snapshot: ClientTagSnapshot): ClientTag {
    const { id, ...state } = snapshot;
    return new ClientTag(id, state);
  }

  get name(): string {
    return this.#state.name;
  }

  get groupId(): ClientTagGroupId | undefined {
    return this.#state.groupId;
  }

  /** Renombrar o mover a otro grupo. Los contactos que la tienen la conservan. */
  update(
    data: { readonly name: string; readonly groupId: ClientTagGroupId | undefined },
    now: Date,
  ): void {
    this.#state = {
      ...this.#state,
      name: cleanName(data.name),
      groupId: data.groupId,
      updatedAt: now,
    };
  }

  toSnapshot(): ClientTagSnapshot {
    return { id: this.id, ...this.#state };
  }
}
