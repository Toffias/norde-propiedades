import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';

export type FavoriteSearchId = Id<'FavoriteSearch'>;

/** Más de 50 búsquedas favoritas ya no se encuentran en la lista: conviene borrar las viejas. */
export const MAX_FAVORITE_SEARCHES = 50;

export interface FavoriteSearchSnapshot {
  readonly id: FavoriteSearchId;
  /** Dueño: usuario de identity, solo por ID. Cada usuario ve solo las suyas. */
  readonly userId: string;
  readonly name: string;
  /** Los parámetros del buscador tal como están en la URL (filtros y orden). */
  readonly params: Readonly<Record<string, string>>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TooManyFavoriteSearchesError {
  readonly type: 'TooManyFavoriteSearches';
  readonly max: number;
}

const MAX_NAME_LENGTH = 60;

/**
 * Búsqueda favorita de un usuario del panel: un nombre para un conjunto de filtros del buscador
 * de propiedades. No es la búsqueda de un cliente (`saved_searches`, #11).
 */
export class FavoriteSearch extends AggregateRoot<FavoriteSearchId, never> {
  #state: Omit<FavoriteSearchSnapshot, 'id'>;

  private constructor(id: FavoriteSearchId, state: Omit<FavoriteSearchSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static create(input: {
    readonly id: FavoriteSearchId;
    readonly userId: string;
    readonly name: string;
    readonly params: Readonly<Record<string, string>>;
    readonly now: Date;
  }): FavoriteSearch {
    return new FavoriteSearch(input.id, {
      userId: input.userId,
      name: input.name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH),
      params: input.params,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static restore(snapshot: FavoriteSearchSnapshot): FavoriteSearch {
    const { id, ...state } = snapshot;
    return new FavoriteSearch(id, state);
  }

  get userId(): string {
    return this.#state.userId;
  }

  get name(): string {
    return this.#state.name;
  }

  /** Guardar con un nombre que ya existe reemplaza los filtros de esa búsqueda. */
  replaceParams(params: Readonly<Record<string, string>>, now: Date): void {
    this.#state = { ...this.#state, params, updatedAt: now };
  }

  toSnapshot(): FavoriteSearchSnapshot {
    return { id: this.id, ...this.#state };
  }
}

export interface FavoriteSearchRepository {
  findById(id: FavoriteSearchId): Promise<FavoriteSearch | undefined>;
  findByName(userId: string, name: string): Promise<FavoriteSearch | undefined>;
  countByUser(userId: string): Promise<number>;
  save(search: FavoriteSearch, actorId: string): Promise<void>;
  delete(id: FavoriteSearchId): Promise<void>;
}
