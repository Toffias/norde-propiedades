import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

/** De a cuántas se borran: cada tanda es una transacción corta. */
const BATCH_SIZE = 500;

/**
 * Borra las suscripciones a búsquedas que vencieron sin confirmar (#208): guardan un nombre y un
 * email que nadie confirmó, y no tienen por qué quedar (Ley 25.326). Corre una vez por día con el
 * resumen de los seguimientos. No se audita: es la limpieza de datos que nunca llegaron a ser de
 * un contacto (el pedido sí quedó auditado, sin datos personales).
 */
export class PurgeExpiredSearchSubscriptions {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(actor: Actor): Promise<Result<{ readonly deleted: number }, ForbiddenError>> {
    if (actor.kind !== 'system' || !actor.can('clients:send-follow-ups')) {
      return err({ type: 'Forbidden' });
    }
    const now = this.deps.clock.now();
    let deleted = 0;
    for (;;) {
      const batch = await this.deps.uow.run((tx) =>
        tx.searchSubscriptions.deleteExpired(now, BATCH_SIZE),
      );
      deleted += batch;
      if (batch < BATCH_SIZE) return ok({ deleted });
    }
  }
}
