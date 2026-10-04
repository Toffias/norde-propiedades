import {
  ErasedClientsInputSchema,
  err,
  ok,
  type Actor,
  type ErasedClientsInput,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import type { AppraisalsUnitOfWork } from '../ports/appraisals-transaction';

export interface InvalidErasureInputError {
  readonly type: 'InvalidInput';
}

export type EraseClientAppraisalsError = ForbiddenError | InvalidErasureInputError;

/**
 * Reacción a `clients.client_erased`: las tasaciones que pidió el cliente suprimido se borran
 * físicamente, con sus fotos (los datos de la propiedad son suyos). Su historial lo borra la
 * supresión por `client_ids`. Idempotente; la constancia la deja clients.
 */
export class EraseClientAppraisals {
  constructor(private readonly deps: { readonly uow: AppraisalsUnitOfWork }) {}

  async execute(
    input: ErasedClientsInput,
    actor: Actor,
  ): Promise<Result<{ readonly erased: number }, EraseClientAppraisalsError>> {
    if (!actor.can('appraisals:erase-client-data')) return err({ type: 'Forbidden' });
    const parsed = ErasedClientsInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'InvalidInput' });
    const erased = await this.deps.uow.run((tx) =>
      tx.appraisals.deleteByRequesters(parsed.data.clientIds),
    );
    return ok({ erased });
  }
}
