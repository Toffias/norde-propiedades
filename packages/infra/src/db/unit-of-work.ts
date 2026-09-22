import type { UnitOfWork } from '@norde/core/shared';

import type { Database } from './client';
import type { DbExecutor } from './executor';

/** Señal interna para deshacer la transacción cuando el trabajo devuelve un `Err`. */
class RollbackForErrResult extends Error {
  constructor(readonly result: unknown) {
    super('Rollback: the unit of work returned an Err result');
  }
}

function isErrResult(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === false;
}

/**
 * Transacción de Postgres. `bind` arma, sobre la transacción abierta, lo que el caso de uso
 * usa adentro (repositorios, outbox, auditoría). Hace rollback si el trabajo lanza o devuelve
 * un `Err` (contrato de `UnitOfWork` en el core).
 */
export class DrizzleUnitOfWork<TContext> implements UnitOfWork<TContext> {
  constructor(
    private readonly db: Database,
    private readonly bind: (executor: DbExecutor) => TContext,
  ) {}

  async run<T>(work: (context: TContext) => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction(async (tx) => {
        const result = await work(this.bind(tx));
        if (isErrResult(result)) throw new RollbackForErrResult(result);
        return result;
      });
    } catch (error) {
      if (error instanceof RollbackForErrResult) {
        // Es el mismo valor que devolvió `work`, de tipo T.
        return error.result as T;
      }
      throw error;
    }
  }
}
