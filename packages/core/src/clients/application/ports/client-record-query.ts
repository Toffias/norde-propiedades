import type { Actor, PageSlice } from '../../../shared';
import type {
  ClientActiveOpportunity,
  ClientActivityKindValue,
  ClientListingSummary,
  ClientOpportunityRow,
  ClientSavedSearchRow,
  ClientTabCounts,
  OpportunityStatusValue,
} from '../../contracts';
import type { ClientActivityBody } from '../../domain/client-activity';

interface Paging {
  readonly offset: number;
  readonly limit: number;
}

type Direction = 'asc' | 'desc';

/** Una entrada del timeline tal como sale de la base: el autor, solo por ID. */
export interface ClientActivityItem {
  readonly id: string;
  readonly opportunityId: string | undefined;
  readonly actorId: string;
  readonly body: ClientActivityBody;
  readonly occurredAt: Date;
}

/** Si está abierta lo decide el dominio por su estado, no el SQL. */
export type ClientOpportunityItem = Omit<ClientOpportunityRow, 'agent' | 'open'> & {
  readonly agentId: string | undefined;
};

export interface ClientFeaturedItem {
  readonly id: string;
  readonly propertyId: string;
  readonly matchScore: number | undefined;
  readonly reaction: 'liked' | 'disliked' | undefined;
  readonly featuredBy: string;
  readonly featuredAt: Date;
}

/**
 * Lo que cuelga de un contacto en su ficha, paginado en la base: actividad, oportunidades,
 * destacadas vigentes, búsquedas guardadas (sin las borradas) y los contadores de las pestañas.
 */
export interface ClientRecordQuery {
  activity(
    criteria: Paging & {
      readonly clientId: string;
      readonly kind: ClientActivityKindValue | undefined;
      readonly direction: Direction;
    },
  ): Promise<PageSlice<ClientActivityItem>>;

  opportunities(
    criteria: Paging & { readonly clientId: string; readonly direction: Direction },
  ): Promise<PageSlice<ClientOpportunityItem>>;

  /** La más reciente entre las que tienen alguno de estos estados (los abiertos, del dominio). */
  activeOpportunity(
    clientId: string,
    openStatuses: readonly OpportunityStatusValue[],
  ): Promise<ClientActiveOpportunity | undefined>;

  featured(
    criteria: Paging & { readonly clientId: string; readonly direction: Direction },
  ): Promise<PageSlice<ClientFeaturedItem>>;

  /** Cuáles de estas propiedades (las de una página del buscador) ya le destacaron. */
  featuredPropertyIds(clientId: string, propertyIds: readonly string[]): Promise<readonly string[]>;

  savedSearches(
    criteria: Paging & { readonly clientId: string; readonly direction: Direction },
  ): Promise<PageSlice<ClientSavedSearchRow>>;

  tabCounts(clientId: string): Promise<ClientTabCounts>;
}

/**
 * Las propiedades que se muestran en la ficha del contacto, del módulo properties (su API pública,
 * con los permisos del actor). Como mucho, las de una página. Las que no están en la cartera (o el
 * actor no ve) no vuelven.
 */
export interface ClientListings {
  summaries(
    propertyIds: readonly string[],
    actor: Actor,
  ): Promise<ReadonlyMap<string, ClientListingSummary>>;
}
