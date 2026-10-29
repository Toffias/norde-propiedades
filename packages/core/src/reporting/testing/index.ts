// Fakes del módulo reporting para tests (`@norde/core/reporting/testing`).

import type { PropertyInterestProfile } from '../../clients';
import type { ListingOwnerKind, PortalId } from '../../portals';
import type { Actor, PageSlice } from '../../shared';
import type {
  AvailabilitySummary,
  CountByPropertyStatus,
  CountByStage,
  PortalPublicationRow,
  PortalPublicationStats,
} from '../contracts';
import type { HomeScope } from '../application/home-scope';
import type {
  AvailableDevelopmentRecord,
  AvailablePropertyRecord,
  ChannelCount,
  HomeDashboardQuery,
  HomeListRequest,
  PendingOpportunityRecord,
  PortalAlertRecord,
  UnassignedInquiryRecord,
  UpcomingSigningRecord,
} from '../application/ports/home-dashboard-query';
import type { ReportingUserNames } from '../application/ports/user-names';
import type {
  PortalKindTally,
  PortalPublicationRequest,
  PublicationOverviewQuery,
  PublishableStatuses,
} from '../application/ports/publication-overview-query';
import type {
  BackgroundTaskCriteria,
  BackgroundTaskQuery,
  BackgroundTaskRecord,
} from '../application/ports/background-task-query';
import type { ReportingPropertyProfiles } from '../application/ports/property-profiles';
import type {
  PropertyStatisticsQuery,
  StatisticsRange,
} from '../application/ports/property-statistics-query';

export class InMemoryReportingProfiles implements ReportingPropertyProfiles {
  constructor(private readonly profiles: readonly PropertyInterestProfile[] = []) {}

  find(propertyId: string, actor: Actor) {
    if (!actor.can('properties:read')) return Promise.resolve(undefined);
    return Promise.resolve(this.profiles.find((profile) => profile.propertyId === propertyId));
  }
}

/** Devuelve lo configurado y registra los rangos pedidos. */
export class StubPropertyStatisticsQuery implements PropertyStatisticsQuery {
  readonly ranges: StatisticsRange[] = [];
  monthlyRows: {
    month: string;
    emailSends: number;
    whatsappSends: number;
    inquiries: number;
  }[] = [];
  interested = 0;
  tags: { tagId: string; name: string; clients: number }[] = [];
  portals: PortalPublicationStats[] = [];
  /** Filas distintas según el rango (los tramos del reporte); sin esto, siempre `monthlyRows`. */
  monthlyFor: ((range: StatisticsRange) => typeof this.monthlyRows) | undefined;

  monthly(_propertyId: string, range: StatisticsRange) {
    this.ranges.push(range);
    return Promise.resolve(this.monthlyFor?.(range) ?? this.monthlyRows);
  }

  interestedCount() {
    return Promise.resolve(this.interested);
  }

  interestedTags(_profile: PropertyInterestProfile, limit: number) {
    return Promise.resolve(this.tags.slice(0, limit));
  }

  publications() {
    return Promise.resolve(this.portals);
  }
}

/** Nombres fijos de usuarios. */
export class InMemoryReportingUserNames implements ReportingUserNames {
  readonly requested: (readonly string[])[] = [];

  constructor(private readonly users: Readonly<Record<string, string>> = {}) {}

  names(ids: readonly string[]) {
    this.requested.push(ids);
    const found = ids.flatMap((id) => {
      const name = this.users[id];
      return name === undefined ? [] : [[id, name] as const];
    });
    return Promise.resolve(new Map(found));
  }
}

/** Una llamada a la query de Inicio: qué método, con qué alcance y qué parámetros. */
export interface HomeQueryCall {
  readonly method: keyof HomeDashboardQuery;
  readonly scope: HomeScope | undefined;
  readonly args: readonly unknown[];
}

/**
 * Devuelve lo configurado y registra cada llamada con su alcance: el filtro por permisos se
 * verifica sobre el alcance que arma el caso de uso (la query lo aplica en SQL, ver el test de
 * integración de infra).
 */
export class StubHomeDashboardQuery implements HomeDashboardQuery {
  readonly calls: HomeQueryCall[] = [];
  inquiries: PageSlice<UnassignedInquiryRecord> = { items: [], total: 0 };
  opportunities: PageSlice<PendingOpportunityRecord> = { items: [], total: 0 };
  signings: PageSlice<UpcomingSigningRecord> = { items: [], total: 0 };
  alerts: PageSlice<PortalAlertRecord> = { items: [], total: 0 };
  clients = 0;
  channels: ChannelCount[] = [];
  stages: CountByStage[] = [];
  statuses: CountByPropertyStatus[] = [];
  developmentCount = 0;
  properties: PageSlice<AvailablePropertyRecord> = { items: [], total: 0 };
  developments: PageSlice<AvailableDevelopmentRecord> = { items: [], total: 0 };

  private record(method: keyof HomeDashboardQuery, scope: HomeScope | undefined, args: unknown[]) {
    this.calls.push({ method, scope, args });
  }

  unassignedInquiries(criteria: { readonly branchId: string | undefined }, limit: number) {
    this.record('unassignedInquiries', undefined, [criteria, limit]);
    return Promise.resolve(this.inquiries);
  }

  opportunitiesInCategories(scope: HomeScope, categories: readonly string[], limit: number) {
    this.record('opportunitiesInCategories', scope, [categories, limit]);
    return Promise.resolve(this.opportunities);
  }

  activeReservationsSigningUntil(scope: HomeScope, until: string, limit: number) {
    this.record('activeReservationsSigningUntil', scope, [until, limit]);
    return Promise.resolve(this.signings);
  }

  portalAlerts(limit: number) {
    this.record('portalAlerts', undefined, [limit]);
    return Promise.resolve(this.alerts);
  }

  clientsWithOpportunitiesIn(scope: HomeScope, categories: readonly string[]) {
    this.record('clientsWithOpportunitiesIn', scope, [categories]);
    return Promise.resolve(this.clients);
  }

  opportunitiesByChannel(scope: HomeScope, categories: readonly string[]) {
    this.record('opportunitiesByChannel', scope, [categories]);
    return Promise.resolve(this.channels);
  }

  opportunitiesByStage(scope: HomeScope, categories: readonly string[]) {
    this.record('opportunitiesByStage', scope, [categories]);
    return Promise.resolve(this.stages);
  }

  propertiesByStatus(scope: HomeScope) {
    this.record('propertiesByStatus', scope, []);
    return Promise.resolve(this.statuses);
  }

  availableDevelopmentsCount(scope: HomeScope) {
    this.record('availableDevelopmentsCount', scope, []);
    return Promise.resolve(this.developmentCount);
  }

  availableProperties(scope: HomeScope, request: HomeListRequest) {
    this.record('availableProperties', scope, [request]);
    return Promise.resolve(this.properties);
  }

  availableDevelopments(scope: HomeScope, request: HomeListRequest) {
    this.record('availableDevelopments', scope, [request]);
    return Promise.resolve(this.developments);
  }
}

const isActiveTask = (task: BackgroundTaskRecord) =>
  task.status === 'pending' || task.status === 'running';

/**
 * Procesos fijos, filtrados como la query real: los del usuario (o todos), sin los portales si no
 * se piden y sin los terminados antes de `finishedSince`. Registra los criterios pedidos.
 */
export class InMemoryBackgroundTaskQuery implements BackgroundTaskQuery {
  readonly criteria: BackgroundTaskCriteria[] = [];

  constructor(readonly tasks: BackgroundTaskRecord[] = []) {}

  list(
    criteria: BackgroundTaskCriteria,
    request: {
      readonly direction: 'asc' | 'desc';
      readonly offset: number;
      readonly limit: number;
    },
  ) {
    this.criteria.push(criteria);
    const sign = request.direction === 'desc' ? -1 : 1;
    const when = (task: BackgroundTaskRecord) => (task.finishedAt ?? task.createdAt).getTime();
    const matching = this.#matching(criteria).sort(
      (a, b) => Number(isActiveTask(b)) - Number(isActiveTask(a)) || sign * (when(a) - when(b)),
    );
    const page: PageSlice<BackgroundTaskRecord> = {
      items: matching.slice(request.offset, request.offset + request.limit),
      total: matching.length,
    };
    return Promise.resolve(page);
  }

  countActive(criteria: BackgroundTaskCriteria) {
    this.criteria.push(criteria);
    return Promise.resolve(this.#matching(criteria).filter(isActiveTask).length);
  }

  #matching(criteria: BackgroundTaskCriteria) {
    return this.tasks.filter(
      (task) =>
        (criteria.requesterId === undefined || task.requesterId === criteria.requesterId) &&
        (criteria.includePortals || task.kind !== 'portal_listing') &&
        (isActiveTask(task) ||
          (task.finishedAt !== undefined && task.finishedAt > criteria.finishedSince)),
    );
  }
}

/** Devuelve lo configurado y registra los pedidos del listado. */
export class StubPublicationOverviewQuery implements PublicationOverviewQuery {
  readonly requests: PortalPublicationRequest[] = [];
  readonly missingAsked: { readonly portal: PortalId; readonly kind: ListingOwnerKind }[] = [];

  constructor(
    readonly data: {
      enabled?: readonly PortalId[];
      properties?: AvailabilitySummary;
      developments?: AvailabilitySummary;
      tallies?: readonly PortalKindTally[];
      missing?: Partial<Record<`${PortalId}:${ListingOwnerKind}`, number>>;
      rows?: readonly PortalPublicationRow[];
    } = {},
  ) {}

  enabledPortals() {
    return Promise.resolve(this.data.enabled ?? []);
  }

  availability(_publishable: PublishableStatuses) {
    const none = { available: 0, onWeb: 0 };
    return Promise.resolve({
      properties: this.data.properties ?? none,
      developments: this.data.developments ?? none,
    });
  }

  listingTallies(portals: readonly PortalId[]) {
    return Promise.resolve((this.data.tallies ?? []).filter((t) => portals.includes(t.portal)));
  }

  missingCount(portal: PortalId, kind: ListingOwnerKind, _publishable: PublishableStatuses) {
    this.missingAsked.push({ portal, kind });
    return Promise.resolve(this.data.missing?.[`${portal}:${kind}`] ?? 0);
  }

  list(request: PortalPublicationRequest) {
    this.requests.push(request);
    const rows = this.data.rows ?? [];
    const page: PageSlice<PortalPublicationRow> = {
      items: rows.slice(request.offset, request.offset + request.limit),
      total: rows.length,
    };
    return Promise.resolve(page);
  }
}
