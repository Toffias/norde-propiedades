/**
 * Resultado de una operación que puede fallar de forma **esperada**.
 *
 * - Errores esperados (negocio, validación, permisos): se devuelven como `Err` con una
 *   unión discriminada (`{ type: 'PropertyNotFound' }`).
 * - Errores inesperados (se cayó la base, un bug): se lanzan como excepción.
 */
export type Result<T, E> = Ok<T, E> | Err<T, E>;

export class Ok<T, E> {
  readonly ok = true;

  constructor(readonly value: T) {}

  isOk(): this is Ok<T, E> {
    return true;
  }

  isErr(): this is Err<T, E> {
    return false;
  }

  map<U>(fn: (value: T) => U): Result<U, E> {
    return new Ok(fn(this.value));
  }

  mapErr<F>(_fn: (error: E) => F): Result<T, F> {
    return new Ok(this.value);
  }

  andThen<U, F>(fn: (value: T) => Result<U, F>): Result<U, E | F> {
    return fn(this.value);
  }

  unwrapOr(_fallback: T): T {
    return this.value;
  }
}

export class Err<T, E> {
  readonly ok = false;

  constructor(readonly error: E) {}

  isOk(): this is Ok<T, E> {
    return false;
  }

  isErr(): this is Err<T, E> {
    return true;
  }

  map<U>(_fn: (value: T) => U): Result<U, E> {
    return new Err(this.error);
  }

  mapErr<F>(fn: (error: E) => F): Result<T, F> {
    return new Err(fn(this.error));
  }

  andThen<U, F>(_fn: (value: T) => Result<U, F>): Result<U, E | F> {
    return new Err(this.error);
  }

  unwrapOr(fallback: T): T {
    return fallback;
  }
}

export function ok<T, E = never>(value: T): Result<T, E> {
  return new Ok(value);
}

export function err<E, T = never>(error: E): Result<T, E> {
  return new Err(error);
}
