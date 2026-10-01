import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';

export type TagGroupId = Id<'PropertyTagGroup'>;
export type TagId = Id<'PropertyTag'>;

const MAX_NAME_LENGTH = 60;

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
}

export interface TagGroupSnapshot {
  readonly id: TagGroupId;
  readonly name: string;
  readonly position: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Grupo de etiquetas de propiedades ("Estado de la documentación", "Campañas"). */
export class TagGroup extends AggregateRoot<TagGroupId, never> {
  #state: Omit<TagGroupSnapshot, 'id'>;

  private constructor(id: TagGroupId, state: Omit<TagGroupSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static create(input: {
    readonly id: TagGroupId;
    readonly name: string;
    readonly position: number;
    readonly now: Date;
  }): TagGroup {
    return new TagGroup(input.id, {
      name: cleanName(input.name),
      position: input.position,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static restore(snapshot: TagGroupSnapshot): TagGroup {
    const { id, ...state } = snapshot;
    return new TagGroup(id, state);
  }

  get name(): string {
    return this.#state.name;
  }

  rename(name: string, now: Date): void {
    this.#state = { ...this.#state, name: cleanName(name), updatedAt: now };
  }

  toSnapshot(): TagGroupSnapshot {
    return { id: this.id, ...this.#state };
  }
}

export interface TagSnapshot {
  readonly id: TagId;
  /** Sin grupo: etiqueta suelta. */
  readonly groupId: TagGroupId | undefined;
  readonly name: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Etiqueta de propiedades. Se usa como atributo de la propiedad y como filtro del buscador. El
 * nombre no se repite dentro de su grupo (sin distinguir mayúsculas).
 */
export class PropertyTag extends AggregateRoot<TagId, never> {
  #state: Omit<TagSnapshot, 'id'>;

  private constructor(id: TagId, state: Omit<TagSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static create(input: {
    readonly id: TagId;
    readonly groupId: TagGroupId | undefined;
    readonly name: string;
    readonly now: Date;
  }): PropertyTag {
    return new PropertyTag(input.id, {
      groupId: input.groupId,
      name: cleanName(input.name),
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static restore(snapshot: TagSnapshot): PropertyTag {
    const { id, ...state } = snapshot;
    return new PropertyTag(id, state);
  }

  get name(): string {
    return this.#state.name;
  }

  get groupId(): TagGroupId | undefined {
    return this.#state.groupId;
  }

  /** Renombrar o mover a otro grupo. */
  update(
    data: { readonly name: string; readonly groupId: TagGroupId | undefined },
    now: Date,
  ): void {
    this.#state = {
      ...this.#state,
      name: cleanName(data.name),
      groupId: data.groupId,
      updatedAt: now,
    };
  }

  toSnapshot(): TagSnapshot {
    return { id: this.id, ...this.#state };
  }
}
