import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import {
  SearchSubscriptionTokenInputSchema,
  type SearchSubscriptionTokenInput,
  type SearchSubscriptionView,
} from '../../contracts';
import {
  searchSubscriptionView,
  type SearchSubscriptionNotFoundError,
} from '../commands/confirm-search-subscription';
import { SUBSCRIBE_PERMISSION } from '../commands/request-search-subscription';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import type { SharedListingTokens } from '../ports/shared-listing-ports';

/** Lo que muestra la página de confirmación de la web antes del botón (#208). */
export class GetSearchSubscription {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly tokens: SharedListingTokens;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: SearchSubscriptionTokenInput,
    actor: Actor,
  ): Promise<Result<SearchSubscriptionView, ForbiddenError | SearchSubscriptionNotFoundError>> {
    if (!actor.can(SUBSCRIBE_PERMISSION)) return err({ type: 'Forbidden' });
    const parsed = SearchSubscriptionTokenInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'SearchSubscriptionNotFound' });
    const tokenHash = this.deps.tokens.hashOf(parsed.data.token);
    const subscription = await this.deps.uow.run((tx) =>
      tx.searchSubscriptions.findByTokenHash(tokenHash),
    );
    if (!subscription) return err({ type: 'SearchSubscriptionNotFound' });
    return ok(searchSubscriptionView(subscription, this.deps.clock.now()));
  }
}
