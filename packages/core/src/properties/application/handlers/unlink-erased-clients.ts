import {
  ErasedClientsInputSchema,
  err,
  ok,
  type Actor,
  type ErasedClientsInput,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import type { PropertyClientErasure } from '../ports/property-client-erasure';

export interface InvalidErasureInputError {
  readonly type: 'InvalidInput';
}

export type UnlinkErasedClientsError = ForbiddenError | InvalidErasureInputError;

/**
 * Reacción a `clients.client_erased`: el cliente suprimido deja de ser propietario de sus
 * propiedades y contacto comercial de un emprendimiento. Las propiedades quedan. Idempotente; no
 * se audita: la constancia de la supresión la deja clients.
 */
export class UnlinkErasedClients {
  constructor(private readonly deps: { readonly erasure: PropertyClientErasure }) {}

  async execute(
    input: ErasedClientsInput,
    actor: Actor,
  ): Promise<Result<{ readonly unlinked: number }, UnlinkErasedClientsError>> {
    if (!actor.can('properties:erase-client-data')) return err({ type: 'Forbidden' });
    const parsed = ErasedClientsInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'InvalidInput' });
    return ok({ unlinked: await this.deps.erasure.unlinkClients(parsed.data.clientIds) });
  }
}
