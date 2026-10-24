import type { ListingOwnerKind, PortalId } from '../../../portals';
import type { PageSlice } from '../../../shared';
import type { AvailabilitySummary, PortalPublicationRow } from '../../contracts';
import type { ListingTally, PublicationCriteria } from '../../domain/publication-buckets';

/** Lo que se considera disponible para publicar (el estado lo da el dominio de reporting). */
export interface PublishableStatuses {
  readonly property: string;
  readonly development: string;
}

/** Los agregados de un portal y un tipo de aviso. */
export interface PortalKindTally {
  readonly portal: PortalId;
  readonly kind: ListingOwnerKind;
  readonly tallies: readonly ListingTally[];
  readonly publishedOwners: number;
}

export interface PortalPublicationRequest {
  readonly portal: PortalId;
  readonly kind: ListingOwnerKind;
  readonly criteria: PublicationCriteria;
  readonly publishable: PublishableStatuses;
  readonly sort: { readonly field: 'updatedAt'; readonly direction: 'asc' | 'desc' };
  readonly offset: number;
  readonly limit: number;
}

/**
 * Difusión (#114): cruza las publicaciones de los portales con las propiedades y los
 * emprendimientos. Los conteos son agregados acotados (portales × tipos × estados); el listado,
 * paginado en la base.
 */
export interface PublicationOverviewQuery {
  /** Los portales con la cuenta prendida en Mi empresa → Portales. */
  enabledPortals(): Promise<readonly PortalId[]>;
  /** Propiedades sueltas y emprendimientos disponibles, y cuántos están en la web. */
  availability(publishable: PublishableStatuses): Promise<{
    readonly properties: AvailabilitySummary;
    readonly developments: AvailabilitySummary;
  }>;
  /** Los avisos que no están dados de baja, agrupados por portal, tipo, estado, tipo y plan. */
  listingTallies(portals: readonly PortalId[]): Promise<readonly PortalKindTally[]>;
  /** Cuánto de lo disponible no tiene aviso vivo en el portal. */
  missingCount(
    portal: PortalId,
    kind: ListingOwnerKind,
    publishable: PublishableStatuses,
  ): Promise<number>;
  list(request: PortalPublicationRequest): Promise<PageSlice<PortalPublicationRow>>;
}
