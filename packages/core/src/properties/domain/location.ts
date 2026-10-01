import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { Coordinates } from './coordinates';

export type LocationId = Id<'Location'>;

/** Niveles de la jerarquía, de arriba hacia abajo: país > provincia > localidad > barrio > subbarrio. */
export const LOCATION_KINDS = [
  'country',
  'province',
  'city',
  'neighborhood',
  'subneighborhood',
] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export const LOCATION_KIND_LABELS: Readonly<Record<LocationKind, string>> = {
  country: 'País',
  province: 'Provincia',
  city: 'Localidad',
  neighborhood: 'Barrio',
  subneighborhood: 'Subbarrio',
};

/** El padre de una ubicación nueva: su nivel y su ruta definen los de la hija. */
export interface LocationParent {
  readonly id: LocationId;
  readonly kind: LocationKind;
  readonly path: string;
}

export interface LocationSnapshot {
  readonly id: LocationId;
  readonly parentId: LocationId | undefined;
  readonly kind: LocationKind;
  readonly name: string;
  /** Ruta materializada de IDs (`/<país>/<provincia>/…/`), para filtrar un subárbol. */
  readonly path: string;
  readonly coordinates: Coordinates | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface LocationTooDeepError {
  readonly type: 'LocationTooDeep';
}

const MAX_NAME_LENGTH = 80;

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
}

/** El nivel que sigue al del padre; sin padre, un país. */
export function childKind(parent: LocationKind | undefined): LocationKind | undefined {
  if (parent === undefined) return 'country';
  return LOCATION_KINDS[LOCATION_KINDS.indexOf(parent) + 1];
}

/**
 * Una ubicación del catálogo jerárquico. El nivel no se elige: es el siguiente al del padre, así
 * el árbol siempre respeta el orden país > provincia > localidad > barrio > subbarrio.
 */
export class Location extends AggregateRoot<LocationId, never> {
  #state: Omit<LocationSnapshot, 'id'>;

  private constructor(id: LocationId, state: Omit<LocationSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static create(input: {
    readonly id: LocationId;
    readonly name: string;
    readonly parent: LocationParent | undefined;
    readonly now: Date;
  }): Result<Location, LocationTooDeepError> {
    const kind = childKind(input.parent?.kind);
    if (kind === undefined) return err({ type: 'LocationTooDeep' });
    return ok(
      new Location(input.id, {
        parentId: input.parent?.id,
        kind,
        name: cleanName(input.name),
        path: `${input.parent?.path ?? '/'}${input.id}/`,
        coordinates: undefined,
        createdAt: input.now,
        updatedAt: input.now,
      }),
    );
  }

  static restore(snapshot: LocationSnapshot): Location {
    const { id, ...state } = snapshot;
    return new Location(id, state);
  }

  get name(): string {
    return this.#state.name;
  }

  get parentId(): LocationId | undefined {
    return this.#state.parentId;
  }

  rename(name: string, now: Date): void {
    this.#state = { ...this.#state, name: cleanName(name), updatedAt: now };
  }

  toSnapshot(): LocationSnapshot {
    return { id: this.id, ...this.#state };
  }
}
