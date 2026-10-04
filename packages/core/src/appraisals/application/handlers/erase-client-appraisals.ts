import {
  ErasedClientsInputSchema,
  err,
  ok,
  type Actor,
  type ErasedClientsInput,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import type { FileStorage } from '../../../settings';
import type { AppraisalsUnitOfWork } from '../ports/appraisals-transaction';

export interface InvalidErasureInputError {
  readonly type: 'InvalidInput';
}

export type EraseClientAppraisalsError = ForbiddenError | InvalidErasureInputError;

/** Cuántas tasaciones se borran por transacción. */
const ERASE_BATCH = 50;

/**
 * Reacción a `clients.client_erased`: las tasaciones que pidió el cliente suprimido se borran
 * físicamente, por tandas, con sus fotos y sus archivos (los datos de la propiedad son suyos). Su
 * historial lo borra la supresión por `client_ids`. Idempotente. La constancia la deja clients.
 */
export class EraseClientAppraisals {
  constructor(
    private readonly deps: { readonly uow: AppraisalsUnitOfWork; readonly storage: FileStorage },
  ) {}

  async execute(
    input: ErasedClientsInput,
    actor: Actor,
  ): Promise<Result<{ readonly erased: number }, EraseClientAppraisalsError>> {
    if (!actor.can('appraisals:erase-client-data')) return err({ type: 'Forbidden' });
    const parsed = ErasedClientsInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'InvalidInput' });
    let erased = 0;
    for (;;) {
      // Los archivos se borran antes de confirmar: si uno falla, las filas vuelven y el reintento
      // los encuentra de nuevo.
      const deleted = await this.deps.uow.run(async (tx) => {
        const batch = await tx.appraisals.deleteByRequesters(parsed.data.clientIds, ERASE_BATCH);
        for (const key of batch.photoKeys) await this.deps.storage.delete(key);
        return batch.deleted;
      });
      erased += deleted;
      if (deleted < ERASE_BATCH) break;
    }
    return ok({ erased });
  }
}
