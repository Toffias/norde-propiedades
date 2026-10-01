import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type { CustomAttributeDefinition, CustomAttributeKind } from './property-details';

export type CustomAttributeId = Id<'CustomAttribute'>;

export interface CustomAttributeSnapshot {
  readonly id: CustomAttributeId;
  readonly name: string;
  readonly kind: CustomAttributeKind;
  /** Opciones de un atributo de lista (`select`); vacío en los demás. */
  readonly options: readonly string[];
  readonly position: number;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Un atributo de lista necesita opciones; los demás no llevan. */
export interface InvalidCustomAttributeOptionsError {
  readonly type: 'InvalidCustomAttributeOptions';
}

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function cleanOptions(
  kind: CustomAttributeKind,
  options: readonly string[],
): Result<readonly string[], InvalidCustomAttributeOptionsError> {
  if (kind !== 'select') return ok([]);
  const clean = [...new Set(options.map(cleanName).filter((option) => option !== ''))];
  return clean.length === 0 ? err({ type: 'InvalidCustomAttributeOptions' }) : ok(clean);
}

/**
 * Atributo que Norde agrega a la ficha además de los estándar (ADR 0014: EAV solo para estos). No
 * se borra ni cambia de tipo: hay propiedades con valores cargados. Se desactiva.
 */
export class CustomAttribute extends AggregateRoot<CustomAttributeId, never> {
  #state: Omit<CustomAttributeSnapshot, 'id'>;

  private constructor(id: CustomAttributeId, state: Omit<CustomAttributeSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static create(input: {
    readonly id: CustomAttributeId;
    readonly name: string;
    readonly kind: CustomAttributeKind;
    readonly options: readonly string[];
    readonly position: number;
    readonly now: Date;
  }): Result<CustomAttribute, InvalidCustomAttributeOptionsError> {
    const options = cleanOptions(input.kind, input.options);
    if (options.isErr()) return err(options.error);
    return ok(
      new CustomAttribute(input.id, {
        name: cleanName(input.name),
        kind: input.kind,
        options: options.value,
        position: input.position,
        isActive: true,
        createdAt: input.now,
        updatedAt: input.now,
      }),
    );
  }

  static restore(snapshot: CustomAttributeSnapshot): CustomAttribute {
    const { id, ...state } = snapshot;
    return new CustomAttribute(id, state);
  }

  get name(): string {
    return this.#state.name;
  }

  /**
   * Nombre, opciones y si se ofrece en la ficha. Quitar una opción no borra los valores ya
   * cargados: se siguen mostrando hasta que alguien edite la propiedad.
   */
  update(
    data: {
      readonly name: string;
      readonly options: readonly string[];
      readonly isActive: boolean;
    },
    now: Date,
  ): Result<void, InvalidCustomAttributeOptionsError> {
    const options = cleanOptions(this.#state.kind, data.options);
    if (options.isErr()) return err(options.error);
    this.#state = {
      ...this.#state,
      name: cleanName(data.name),
      options: options.value,
      isActive: data.isActive,
      updatedAt: now,
    };
    return ok(undefined);
  }

  /** Lo que necesita la validación de los valores de una propiedad. */
  toDefinition(): CustomAttributeDefinition {
    return {
      id: this.id,
      kind: this.#state.kind,
      options: this.#state.options,
      isActive: this.#state.isActive,
    };
  }

  toSnapshot(): CustomAttributeSnapshot {
    return { id: this.id, ...this.#state };
  }
}
