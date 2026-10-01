import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import { FavoritesInputSchema, type FavoritesInput } from '../../contracts';
import type { FavoriteQuery } from '../ports/user-favorites';
import type { InvalidInputError } from '../user-audit';

/** Cuáles de los registros de una página son favoritos de quien pregunta (para las estrellas). */
export class GetFavoriteIds {
  constructor(private readonly deps: { readonly favorites: FavoriteQuery }) {}

  async execute(
    input: FavoritesInput,
    actor: Actor,
  ): Promise<Result<ReadonlySet<string>, ForbiddenError | InvalidInputError>> {
    if (actor.kind !== 'user') return err({ type: 'Forbidden' });
    const parsed = FavoritesInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const ids = parsed.data.ids.map((id) => id.toLowerCase());
    return ok(new Set(await this.deps.favorites.existing(actor.id, parsed.data.entityType, ids)));
  }
}
