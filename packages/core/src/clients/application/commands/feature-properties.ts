import { accessScope, canActOn, OWNERSHIP_RULES } from '../../../identity';
import {
  auditAction,
  err,
  nextId,
  ok,
  toAuditValue,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import {
  FeaturePropertiesInputSchema,
  type FeaturePropertiesInput,
  type FeaturePropertiesOutput,
} from '../../contracts';
import type { ClientInTrashError } from '../../domain/client';
import {
  FeaturedListing,
  listingsFeaturedEvent,
  propertiesToFeature,
} from '../../domain/featured-listing';
import { latestOpenOpportunity } from '../../domain/opportunity';
import { MAX_SAVED_SEARCHES_PER_CLIENT } from '../../domain/saved-search';
import { bestMatchScore } from '../../domain/saved-search-match';
import {
  clientTarget,
  findClient,
  invalidInput,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientListings } from '../ports/client-record-query';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import type { PropertyProfiles } from '../ports/property-interest-query';

/** Alguna propiedad no está en la cartera (o el actor no la ve). */
export interface ListingNotFoundError {
  readonly type: 'ListingNotFound';
}

export type FeaturePropertiesError =
  | ForbiddenError
  | InvalidInputError
  | ClientNotFoundError
  | ClientInTrashError
  | ListingNotFoundError;

/**
 * Destaca propiedades de la cartera para un contacto (desde su ficha, el buscador o la ficha de la
 * propiedad). Las que ya estaban destacadas no se repiten. Cada una guarda su coincidencia con la
 * mejor búsqueda guardada del contacto y queda atada a su oportunidad abierta más reciente, que se
 * entera por un evento (regla "al reactivar"). Lo hace quien puede editar el contacto y queda en su
 * historial.
 */
export class FeatureProperties {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly listings: ClientListings;
      readonly profiles: PropertyProfiles;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: FeaturePropertiesInput,
    actor: Actor,
  ): Promise<Result<FeaturePropertiesOutput, FeaturePropertiesError>> {
    const rule = OWNERSHIP_RULES.clientsUpdate;
    if (accessScope(actor, rule) === undefined) return err({ type: 'Forbidden' });

    const parsed = FeaturePropertiesInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const requested = [...new Set(parsed.data.propertyIds.map((id) => id.toLowerCase()))];

    // Las propiedades son de otro módulo: se leen por su API pública, fuera de la transacción.
    const listings = await this.deps.listings.summaries(requested, actor);
    if (requested.some((id) => !listings.has(id))) return err({ type: 'ListingNotFound' });
    const profiles = await this.deps.profiles.findMany(requested, actor);
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<FeaturePropertiesOutput, FeaturePropertiesError>> => {
        const client = await findClient(tx.clients, parsed.data.clientId);
        if (!client) return err({ type: 'ClientNotFound' });
        if (!canActOn(actor, rule, client.ownership)) return err({ type: 'Forbidden' });
        if (client.isDeleted) return err({ type: 'ClientInTrash' });

        const active = await tx.featured.findActive(client.id, requested);
        const added = propertiesToFeature(requested, active);
        if (added.length === 0) return ok({ featured: 0 });

        const searches = (
          await tx.savedSearches.findActiveByClient(client.id, MAX_SAVED_SEARCHES_PER_CLIENT)
        ).map((search) => search.criteria);
        const opportunity = latestOpenOpportunity(
          await tx.opportunities.findOpenByClient(client.id),
        );
        for (const propertyId of added) {
          const profile = profiles.get(propertyId);
          const listing = FeaturedListing.feature({
            id: nextId<'FeaturedListing'>(this.deps.ids),
            clientId: client.id,
            propertyId,
            opportunityId: opportunity?.id,
            matchScore: profile === undefined ? undefined : bestMatchScore(profile, searches),
            by: actor.id,
            now,
          });
          await tx.featured.save(listing, actor.id);
        }
        if (opportunity) {
          await tx.events.publish([
            listingsFeaturedEvent({
              opportunityId: opportunity.id,
              clientId: client.id,
              propertyIds: added,
              now,
            }),
          ]);
        }
        await tx.audit.record(
          auditAction(actor, clientTarget('client.listings_featured', client.id), {
            propertyIds: { before: null, after: toAuditValue(added) },
            ...(opportunity ? { opportunityId: { before: null, after: opportunity.id } } : {}),
          }),
        );
        return ok({ featured: added.length });
      },
    );
  }
}
