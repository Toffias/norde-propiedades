import type { z } from 'zod';

import { ok, type Result } from '../domain/result';

// Clave de idempotencia de las altas (ADR 0050): el formulario manda la misma clave en cada
// reintento, así un doble clic, un reintento de la red o un "Reintentar" no repiten el alta. En los
// contracts va como `idempotencyKey: idempotencyKeySchema.optional()`.

/** Una clave se usa una vez por persona y por command. */
export interface IdempotencyScope {
  readonly actorId: string;
  /** Nombre del command: `CreateClient`, `ReserveProperty`. */
  readonly command: string;
  readonly key: string;
}

export type IdempotencyClaim =
  { readonly claimed: true } | { readonly claimed: false; readonly result: unknown };

/**
 * Claves de idempotencia, dentro de la transacción del command. `claim` reserva la clave; si otro
 * pedido con la misma clave está en curso, espera a que termine. Si ya terminó bien, devuelve lo que
 * guardó `complete`. Si el command falla, el rollback libera la clave.
 */
export interface IdempotencyKeys {
  claim(scope: IdempotencyScope): Promise<IdempotencyClaim>;
  complete(scope: IdempotencyScope, result: unknown): Promise<void>;
}

/**
 * Corre `work` una sola vez por clave. Sin clave, lo corre siempre. Con una clave ya usada,
 * devuelve el resultado guardado sin volver a correrlo. Va **dentro** de `uow.run`.
 *
 * El resultado se guarda como JSON: tiene que ser un objeto plano con IDs y valores simples (nada
 * de datos personales, ver la supresión).
 */
export async function runIdempotent<T, E>(
  keys: IdempotencyKeys,
  scope: IdempotencyScope | undefined,
  resultSchema: z.ZodType<T>,
  work: () => Promise<Result<T, E>>,
): Promise<Result<T, E>> {
  if (scope === undefined) return work();
  const claim = await keys.claim(scope);
  if (!claim.claimed) return ok(resultSchema.parse(claim.result));
  const result = await work();
  if (result.isOk()) await keys.complete(scope, result.value);
  return result;
}

/** El alcance de la clave para un actor, o `undefined` si el pedido no trajo clave. */
export function idempotencyScope(
  actorId: string,
  command: string,
  key: string | undefined,
): IdempotencyScope | undefined {
  return key === undefined ? undefined : { actorId, command, key };
}
