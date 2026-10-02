import {
  ErasedClientsInputSchema,
  err,
  ok,
  type Actor,
  type ErasedClientsInput,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import type { ClientFavoriteErasure } from '../ports/client-favorite-erasure';

export interface InvalidErasureInputError {
  readonly type: 'InvalidInput';
}

export type RemoveErasedClientFavoritesError = ForbiddenError | InvalidErasureInputError;

/**
 * Reacción a `clients.client_erased`: el cliente suprimido sale de los favoritos de todos los
 * usuarios. Idempotente; no se audita: la constancia de la supresión la deja clients.
 */
export class RemoveErasedClientFavorites {
  constructor(private readonly deps: { readonly favorites: ClientFavoriteErasure }) {}

  async execute(
    input: ErasedClientsInput,
    actor: Actor,
  ): Promise<Result<{ readonly removed: number }, RemoveErasedClientFavoritesError>> {
    if (!actor.can('identity:erase-client-data')) return err({ type: 'Forbidden' });
    const parsed = ErasedClientsInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'InvalidInput' });
    return ok({ removed: await this.deps.favorites.removeClients(parsed.data.clientIds) });
  }
}
