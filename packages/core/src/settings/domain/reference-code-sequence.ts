import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

import type {
  ReferenceCodePrefix,
  ReferenceCodeScope,
  ReferenceCodeScopeKey,
} from './reference-code';

export type ReferenceCodeSequenceId = Id<'ReferenceCodeSequence'>;

export interface ReferenceCodeSequenceSnapshot {
  readonly id: ReferenceCodeSequenceId;
  readonly scope: ReferenceCodeScope;
  readonly scopeValue: string;
  readonly prefix: ReferenceCodePrefix;
  /** El próximo número a entregar. Lo avanza el repositorio de forma atómica. */
  readonly nextNumber: bigint;
}

export type ReferenceCodeSequenceError =
  | { readonly type: 'InvalidScopeValue' }
  | { readonly type: 'PrefixInUse'; readonly prefix: string }
  | { readonly type: 'ScopeAlreadyConfigured' }
  | { readonly type: 'GlobalSequenceRequired' };

/**
 * Numeración correlativa de códigos de referencia para un alcance (global, tipo de propiedad,
 * usuario, equipo o sucursal). Cada prefijo tiene su propio correlativo, así que dos numeraciones
 * no pueden compartir prefijo: entregarían el mismo código.
 */
export class ReferenceCodeSequence extends AggregateRoot<ReferenceCodeSequenceId, never> {
  #state: Omit<ReferenceCodeSequenceSnapshot, 'id'>;

  private constructor(
    id: ReferenceCodeSequenceId,
    state: Omit<ReferenceCodeSequenceSnapshot, 'id'>,
  ) {
    super(id);
    this.#state = state;
  }

  static create(input: {
    readonly id: ReferenceCodeSequenceId;
    readonly key: ReferenceCodeScopeKey;
    readonly prefix: ReferenceCodePrefix;
    /** Numeraciones que ya usan el mismo prefijo o el mismo alcance. */
    readonly conflicts: readonly ReferenceCodeSequence[];
  }): Result<ReferenceCodeSequence, ReferenceCodeSequenceError> {
    const { scope, scopeValue } = input.key;
    const value = scopeValue.trim();
    if ((scope === 'global') !== (value === '')) return err({ type: 'InvalidScopeValue' });
    if (input.conflicts.some((s) => s.scope === scope && s.scopeValue === value)) {
      return err({ type: 'ScopeAlreadyConfigured' });
    }
    if (input.conflicts.some((s) => s.prefix.equals(input.prefix))) {
      return err({ type: 'PrefixInUse', prefix: input.prefix.value });
    }
    return ok(
      new ReferenceCodeSequence(input.id, {
        scope,
        scopeValue: value,
        prefix: input.prefix,
        nextNumber: 1n,
      }),
    );
  }

  static restore(snapshot: ReferenceCodeSequenceSnapshot): ReferenceCodeSequence {
    const { id, ...state } = snapshot;
    return new ReferenceCodeSequence(id, state);
  }

  get scope(): ReferenceCodeScope {
    return this.#state.scope;
  }

  get scopeValue(): string {
    return this.#state.scopeValue;
  }

  get prefix(): ReferenceCodePrefix {
    return this.#state.prefix;
  }

  /**
   * Cambia el prefijo; el correlativo sigue donde estaba. `others` son las demás numeraciones con
   * ese prefijo.
   */
  changePrefix(
    prefix: ReferenceCodePrefix,
    others: readonly ReferenceCodeSequence[],
  ): Result<void, ReferenceCodeSequenceError> {
    if (others.some((s) => s.id !== this.id && s.prefix.equals(prefix))) {
      return err({ type: 'PrefixInUse', prefix: prefix.value });
    }
    this.#state = { ...this.#state, prefix };
    return ok(undefined);
  }

  /** Se puede borrar cualquier numeración salvo la global: siempre tiene que haber una que aplique. */
  ensureRemovable(): Result<void, ReferenceCodeSequenceError> {
    if (this.#state.scope === 'global') return err({ type: 'GlobalSequenceRequired' });
    return ok(undefined);
  }

  toSnapshot(): ReferenceCodeSequenceSnapshot {
    return { id: this.id, ...this.#state };
  }
}
