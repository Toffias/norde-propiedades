import {
  auditAction,
  err,
  ok,
  type Actor,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { FavoriteSearchIdInputSchema, type FavoriteSearchIdInput } from '../../contracts';
import { catalogTarget, idOf, type FavoriteSearchNotFoundError } from '../catalog-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { InvalidInputError } from '../property-support';

export type DeleteFavoriteSearchError =
  ForbiddenError | InvalidInputError | FavoriteSearchNotFoundError;

/** Borra una búsqueda favorita propia. Las de otro usuario no existen para quien pregunta. */
export class DeleteFavoriteSearch {
  constructor(private readonly deps: { readonly uow: PropertiesUnitOfWork }) {}

  async execute(
    input: FavoriteSearchIdInput,
    actor: Actor,
  ): Promise<Result<void, DeleteFavoriteSearchError>> {
    if (!actor.can('properties:read') || actor.kind !== 'user') return err({ type: 'Forbidden' });

    const parsed = FavoriteSearchIdInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }

    return this.deps.uow.run(async (tx): Promise<Result<void, DeleteFavoriteSearchError>> => {
      const id = idOf<'FavoriteSearch'>(parsed.data.searchId);
      const search = id === undefined ? undefined : await tx.favoriteSearches.findById(id);
      if (search?.userId !== actor.id) return err({ type: 'FavoriteSearchNotFound' });

      await tx.favoriteSearches.delete(search.id);
      await tx.audit.record(
        auditAction(actor, catalogTarget('favorite_search', 'favorite_search.deleted', search.id), {
          name: { before: search.name, after: null },
        }),
      );
      return ok(undefined);
    });
  }
}
