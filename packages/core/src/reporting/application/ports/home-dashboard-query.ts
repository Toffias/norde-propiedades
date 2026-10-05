import type { PageSlice } from '../../../shared';
import type {
  AvailableDevelopmentRow,
  AvailablePropertyRow,
  AVAILABLE_LIST_SORT_FIELDS,
  CountByChannel,
  CountByPropertyStatus,
  CountByStage,
  PendingOpportunityRow,
  UnassignedInquiryRow,
  UpcomingSigningRow,
} from '../../contracts';
import type { HomeScope } from '../home-scope';

type WithAgentId<T extends { readonly agent: unknown }> = Omit<T, 'agent'> & {
  readonly agentId: string | undefined;
};

export type PendingOpportunityRecord = WithAgentId<PendingOpportunityRow>;
export type UpcomingSigningRecord = Omit<WithAgentId<UpcomingSigningRow>, 'overdue'>;
export type AvailablePropertyRecord = WithAgentId<AvailablePropertyRow>;
export type AvailableDevelopmentRecord = WithAgentId<AvailableDevelopmentRow>;

export type ChannelCount = Omit<CountByChannel, 'share'>;

export interface HomeListRequest {
  readonly sort: {
    readonly field: (typeof AVAILABLE_LIST_SORT_FIELDS)[number];
    readonly direction: 'asc' | 'desc';
  };
  readonly offset: number;
  readonly limit: number;
}

/**
 * Lecturas de Inicio. Cruzan tablas de varios módulos (es un modelo de lectura de reporting) y
 * cada una tiene su propio límite: ninguna devuelve una lista completa.
 */
export interface HomeDashboardQuery {
  /** Consultas pendientes de asignar, de la más vieja a la más nueva. */
  unassignedInquiries(
    criteria: { readonly branchId: string | undefined },
    limit: number,
  ): Promise<PageSlice<UnassignedInquiryRow>>;
  /** Oportunidades en esas categorías, de la que más espera a la que menos. */
  opportunitiesInCategories(
    scope: HomeScope,
    categories: readonly string[],
    limit: number,
  ): Promise<PageSlice<PendingOpportunityRecord>>;
  /** Reservas activas con firma estimada hasta `until` (`AAAA-MM-DD`, inclusive), la más próxima primero. */
  activeReservationsSigningUntil(
    scope: HomeScope,
    until: string,
    limit: number,
  ): Promise<PageSlice<UpcomingSigningRecord>>;
  /** Clientes distintos con al menos una oportunidad en esas categorías. */
  clientsWithOpportunitiesIn(scope: HomeScope, categories: readonly string[]): Promise<number>;
  /** Oportunidades en esas categorías por canal de origen, de mayor a menor. */
  opportunitiesByChannel(
    scope: HomeScope,
    categories: readonly string[],
  ): Promise<readonly ChannelCount[]>;
  /** Oportunidades por estado editable, en el orden de los estados; solo los de esas categorías. */
  opportunitiesByStage(
    scope: HomeScope,
    categories: readonly string[],
  ): Promise<readonly CountByStage[]>;
  /** Propiedades (sin las borradas) por estado. */
  propertiesByStatus(scope: HomeScope): Promise<readonly CountByPropertyStatus[]>;
  /** Emprendimientos en comercialización. */
  availableDevelopmentsCount(scope: HomeScope): Promise<number>;
  availableProperties(
    scope: HomeScope,
    request: HomeListRequest,
  ): Promise<PageSlice<AvailablePropertyRecord>>;
  availableDevelopments(
    scope: HomeScope,
    request: HomeListRequest,
  ): Promise<PageSlice<AvailableDevelopmentRecord>>;
}
