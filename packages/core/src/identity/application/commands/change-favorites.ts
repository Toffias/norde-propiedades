import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { FavoritesInputSchema, type FavoritesInput } from '../../contracts';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';
import type { InvalidInputError } from '../user-audit';

export type ChangeFavoritesError = ForbiddenError | InvalidInputError;

/** Cuántos favoritos se sumaron o se quitaron (los que ya estaban así no cuentan). */
export interface ChangeFavoritesOutput {
  readonly changed: number;
}

function favoritesTarget(action: string, userId: string) {
  return { action, entityType: 'user', entityId: userId, clientIds: [] };
}

/**
 * Marca clientes, propiedades o emprendimientos como favoritos de quien lo pide. Cada usuario
 * tiene los suyos; no hace falta un permiso especial más allá de usar el panel.
 */
export class AddFavorites {
  constructor(private readonly deps: { readonly uow: IdentityUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: FavoritesInput,
    actor: Actor,
  ): Promise<Result<ChangeFavoritesOutput, ChangeFavoritesError>> {
    if (actor.kind !== 'user') return err({ type: 'Forbidden' });
    const parsed = FavoritesInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { entityType } = parsed.data;
    const ids = [...new Set(parsed.data.ids.map((id) => id.toLowerCase()))];
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<ChangeFavoritesOutput, ChangeFavoritesError>> => {
        const already = new Set(await tx.favorites.existing(actor.id, entityType, ids));
        const added = ids.filter((id) => !already.has(id));
        if (added.length === 0) return ok({ changed: 0 });

        await tx.favorites.add(actor.id, entityType, added, now);
        await tx.audit.record(
          auditAction(actor, favoritesTarget('user.favorites_added', actor.id), {
            entityType: { before: null, after: entityType },
            ids: { before: null, after: added },
          }),
        );
        return ok({ changed: added.length });
      },
    );
  }
}

/** Quita favoritos de quien lo pide. */
export class RemoveFavorites {
  constructor(private readonly deps: { readonly uow: IdentityUnitOfWork }) {}

  async execute(
    input: FavoritesInput,
    actor: Actor,
  ): Promise<Result<ChangeFavoritesOutput, ChangeFavoritesError>> {
    if (actor.kind !== 'user') return err({ type: 'Forbidden' });
    const parsed = FavoritesInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { entityType } = parsed.data;
    const ids = [...new Set(parsed.data.ids.map((id) => id.toLowerCase()))];

    return this.deps.uow.run(
      async (tx): Promise<Result<ChangeFavoritesOutput, ChangeFavoritesError>> => {
        const removed = await tx.favorites.existing(actor.id, entityType, ids);
        if (removed.length === 0) return ok({ changed: 0 });

        await tx.favorites.remove(actor.id, entityType, removed);
        await tx.audit.record(
          auditAction(actor, favoritesTarget('user.favorites_removed', actor.id), {
            entityType: { before: entityType, after: null },
            ids: { before: [...removed], after: null },
          }),
        );
        return ok({ changed: removed.length });
      },
    );
  }
}
