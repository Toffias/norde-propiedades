import {
  auditCreated,
  auditUpdated,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import {
  ListPanelPropertiesQuerySchema,
  SaveFavoriteSearchInputSchema,
  type SaveFavoriteSearchInput,
} from '../../contracts';
import {
  FavoriteSearch,
  MAX_FAVORITE_SEARCHES,
  type TooManyFavoriteSearchesError,
} from '../../domain/favorite-search';
import { catalogTarget } from '../catalog-support';
import type { PropertiesUnitOfWork } from '../ports/properties-transaction';
import type { InvalidInputError } from '../property-support';

export type SaveFavoriteSearchError =
  ForbiddenError | InvalidInputError | TooManyFavoriteSearchesError;

function auditState(search: FavoriteSearch) {
  const s = search.toSnapshot();
  return { name: s.name, params: s.params };
}

/**
 * Guarda los filtros actuales del buscador con un nombre, para el usuario que los guarda. Con un
 * nombre que ya usó, reemplaza los filtros de esa búsqueda.
 */
export class SaveFavoriteSearch {
  constructor(
    private readonly deps: {
      readonly uow: PropertiesUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: SaveFavoriteSearchInput,
    actor: Actor,
  ): Promise<Result<{ readonly searchId: string }, SaveFavoriteSearchError>> {
    if (!actor.can('properties:read') || actor.kind !== 'user') return err({ type: 'Forbidden' });

    const parsed = SaveFavoriteSearchInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { name } = parsed.data;
    const params = Object.fromEntries(
      Object.entries(parsed.data.params).filter(([, value]) => value !== ''),
    );
    // Se guardan filtros que el buscador acepta: una búsqueda favorita siempre se puede abrir.
    const valid = ListPanelPropertiesQuerySchema.safeParse(params);
    if (!valid.success) {
      return err({ type: 'InvalidInput', issues: valid.error.issues.map((i) => i.message) });
    }
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly searchId: string }, SaveFavoriteSearchError>> => {
        const existing = await tx.favoriteSearches.findByName(actor.id, name);
        if (existing) {
          const before = auditState(existing);
          existing.replaceParams(params, now);
          const entry = auditUpdated(
            actor,
            catalogTarget('favorite_search', 'favorite_search.updated', existing.id),
            before,
            auditState(existing),
          );
          if (entry) {
            await tx.favoriteSearches.save(existing, actor.id);
            await tx.audit.record(entry);
          }
          return ok({ searchId: existing.id });
        }

        if ((await tx.favoriteSearches.countByUser(actor.id)) >= MAX_FAVORITE_SEARCHES) {
          return err({ type: 'TooManyFavoriteSearches', max: MAX_FAVORITE_SEARCHES });
        }
        const search = FavoriteSearch.create({
          id: nextId<'FavoriteSearch'>(this.deps.ids),
          userId: actor.id,
          name,
          params,
          now,
        });
        await tx.favoriteSearches.save(search, actor.id);
        await tx.audit.record(
          auditCreated(
            actor,
            catalogTarget('favorite_search', 'favorite_search.created', search.id),
            auditState(search),
          ),
        );
        return ok({ searchId: search.id });
      },
    );
  }
}
