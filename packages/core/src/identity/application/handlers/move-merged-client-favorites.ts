import {
  auditAction,
  err,
  MergedClientInputSchema,
  ok,
  type Actor,
  type ForbiddenError,
  type MergedClientInput,
  type Result,
} from '../../../shared';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';

export interface InvalidMergeInputError {
  readonly type: 'InvalidInput';
}

export type MoveMergedClientFavoritesError = ForbiddenError | InvalidMergeInputError;

/**
 * Reacción a `clients.clients_merged`: quien tenía al duplicado en favoritos pasa a tener al
 * contacto que queda (si ya lo tenía, queda uno). Cada usuario lo deja en su historial.
 * Idempotente: una segunda vez no encuentra nada que mover.
 */
export class MoveMergedClientFavorites {
  constructor(private readonly deps: { readonly uow: IdentityUnitOfWork }) {}

  async execute(
    input: MergedClientInput,
    actor: Actor,
  ): Promise<Result<{ readonly moved: number }, MoveMergedClientFavoritesError>> {
    if (!actor.can('identity:merge-client-data')) return err({ type: 'Forbidden' });
    const parsed = MergedClientInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'InvalidInput' });
    const { clientId, mergedClientId } = parsed.data;

    const moved = await this.deps.uow.run(async (tx) => {
      const userIds = await tx.favorites.moveEntity('client', mergedClientId, clientId);
      for (const userId of userIds) {
        await tx.audit.record(
          auditAction(
            actor,
            {
              action: 'user.favorites_merged',
              entityType: 'user',
              entityId: userId,
              clientIds: [clientId, mergedClientId],
            },
            { clientId: { before: mergedClientId, after: clientId } },
          ),
        );
      }
      return userIds.length;
    });
    return ok({ moved });
  }
}
