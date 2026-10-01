import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';

export type FeatureId = Id<'Feature'>;

/** Servicios (gas natural, agua corriente), ambientes (cocina, lavadero) y adicionales (pileta). */
export const FEATURE_KINDS = ['service', 'room', 'amenity'] as const;
export type FeatureKind = (typeof FEATURE_KINDS)[number];

export interface FeatureSnapshot {
  readonly id: FeatureId;
  readonly kind: FeatureKind;
  /** Clave estable (`amenity-pileta`): no cambia al renombrar. La usan las importaciones. */
  readonly key: string;
  readonly name: string;
  readonly position: number;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const MAX_NAME_LENGTH = 60;

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
}

/** `amenity` + "Pileta climatizada" → `amenity-pileta-climatizada`. */
export function featureKey(kind: FeatureKind, name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${kind}-${slug}`;
}

/**
 * Un ítem del catálogo de servicios, ambientes y adicionales (ADR 0014). No se borra: una
 * propiedad puede tenerlo marcado. Se desactiva y deja de ofrecerse en la ficha y en los filtros.
 */
export class Feature extends AggregateRoot<FeatureId, never> {
  #state: Omit<FeatureSnapshot, 'id'>;

  private constructor(id: FeatureId, state: Omit<FeatureSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static create(input: {
    readonly id: FeatureId;
    readonly kind: FeatureKind;
    readonly name: string;
    /** `featureKey(kind, name)`, o con un sufijo si otro ítem ya la usa. */
    readonly key: string;
    /** Va al final de su tipo. */
    readonly position: number;
    readonly now: Date;
  }): Feature {
    return new Feature(input.id, {
      kind: input.kind,
      key: input.key,
      name: cleanName(input.name),
      position: input.position,
      isActive: true,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static restore(snapshot: FeatureSnapshot): Feature {
    const { id, ...state } = snapshot;
    return new Feature(id, state);
  }

  get kind(): FeatureKind {
    return this.#state.kind;
  }

  get name(): string {
    return this.#state.name;
  }

  update(data: { readonly name: string; readonly isActive: boolean }, now: Date): void {
    this.#state = {
      ...this.#state,
      name: cleanName(data.name),
      isActive: data.isActive,
      updatedAt: now,
    };
  }

  toSnapshot(): FeatureSnapshot {
    return { id: this.id, ...this.#state };
  }
}
