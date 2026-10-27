import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import {
  SharedListingTokenInputSchema,
  type PublicSharedListing,
  type SharedListingTokenInput,
} from '../../contracts';
import type { SharedListingUnavailableError } from '../../domain/shared-listing';
import type { SharedListingNotFoundError } from '../commands/revoke-shared-listing';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import type { AgentNames } from '../ports/property-interest-query';
import type { SharedListingTokens } from '../ports/shared-listing-ports';

export type GetSharedListingError =
  ForbiddenError | SharedListingNotFoundError | SharedListingUnavailableError;

/**
 * Lo que la página pública `/e/<token>` muestra de un envío: sus propiedades con la reacción de
 * cada una y el nombre del asesor. Nada del cliente. No registra la apertura: eso lo hace
 * `OpenSharedListing` desde el navegador, así la vista previa de un link no cuenta.
 */
export class GetSharedListing {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly tokens: SharedListingTokens;
      readonly agents: AgentNames;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: SharedListingTokenInput,
    actor: Actor,
  ): Promise<Result<PublicSharedListing, GetSharedListingError>> {
    if (!actor.can('clients:respond-to-listings')) return err({ type: 'Forbidden' });
    const parsed = SharedListingTokenInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'SharedListingNotFound' });

    const listing = await this.deps.uow.run((tx) =>
      tx.sharedListings.findByTokenHash(this.deps.tokens.hashOf(parsed.data.token)),
    );
    if (!listing) return err({ type: 'SharedListingNotFound' });
    const availability = listing.availability(this.deps.clock.now());
    if (availability !== 'available') {
      return err({ type: 'SharedListingUnavailable', reason: availability });
    }
    const snapshot = listing.toSnapshot();
    const advisorName = (await this.deps.agents.names([snapshot.sentBy])).get(snapshot.sentBy);
    return ok({
      expiresAt: snapshot.expiresAt,
      advisorName,
      items: snapshot.items.map((item) => ({
        propertyId: item.propertyId,
        reaction: item.reaction,
      })),
    });
  }
}
