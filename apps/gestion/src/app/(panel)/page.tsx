import {
  HOME_LIST_PAGE_SIZE,
  HomeFilterSchema,
  ListAvailableDevelopmentsQuerySchema,
  ListAvailablePropertiesQuerySchema,
} from '@norde/core/reporting/contracts';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { getContainer } from '../../container';
import { HomeToolbar } from '../../features/home/components/home-toolbar';
import { PendingView } from '../../features/home/components/pending-view';
import { PortfolioView } from '../../features/home/components/portfolio-view';
import {
  DEVELOPMENTS_PAGE_PARAM,
  HOME_VIEW_VALUES,
  PENDING_FOCUS_PARAM,
  PROPERTIES_PAGE_PARAM,
  type HomeFilterValues,
  type HomeView,
} from '../../features/home/home-params';
import { widgetState } from '../../features/home/home-state';
import { parseListParams, type SearchParams } from '../../lib/list-params';
import { requireSession } from '../../lib/session';

export const metadata: Metadata = { title: 'Inicio' };

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function homeView(value: string | undefined): HomeView {
  return HOME_VIEW_VALUES.find((view) => view === value) ?? 'pendientes';
}

/**
 * Inicio (#15): los pendientes del día y el estado de la cartera. Solo se consultan los widgets de
 * la vista elegida; cada uno es un caso de uso con su propio límite.
 */
export default async function HomePage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const params = await searchParams;
  const view = homeView(single(params.vista));
  const { value: filter, invalidKeys } = parseListParams(HomeFilterSchema, {
    agentId: params.agentId,
    branchId: params.branchId,
  });
  const filters: HomeFilterValues = {
    agentId: filter.agentId ?? '',
    branchId: filter.branchId ?? '',
  };
  const { reporting } = getContainer();

  let content: ReactNode;
  let agentLabel: string | undefined;
  if (view === 'pendientes') {
    // Sin la función de portales prendida, no hay avisos que revisar.
    const portalsEnabled = getContainer().portals !== undefined;
    const [inquiries, opportunities, signings, alerts] = await Promise.all([
      reporting.getUnassignedInquiries.execute(filter, actor),
      reporting.getPendingOpportunities.execute(filter, actor),
      reporting.getUpcomingSignings.execute(filter, actor),
      portalsEnabled ? reporting.getPortalAlerts.execute({}, actor) : undefined,
    ]);
    // El nombre del agente filtrado, para el selector: sale de las filas.
    agentLabel = [
      ...(opportunities.isOk() ? opportunities.value.items : []),
      ...(signings.isOk() ? signings.value.items : []),
    ].find((row) => row.agent?.id === filter.agentId)?.agent?.name;
    content = (
      <PendingView
        inquiries={widgetState(inquiries)}
        opportunities={widgetState(opportunities)}
        signings={widgetState(signings)}
        alerts={alerts === undefined ? { kind: 'hidden' } : widgetState(alerts)}
        focus={single(params[PENDING_FOCUS_PARAM])}
        filters={filters}
        pickAgents={actor.can('users:read')}
        now={new Date()}
      />
    );
  } else {
    const list = { ...filter, pageSize: String(HOME_LIST_PAGE_SIZE) };
    const propertiesQuery = parseListParams(ListAvailablePropertiesQuerySchema, {
      ...list,
      page: params[PROPERTIES_PAGE_PARAM],
    }).value;
    const developmentsQuery = parseListParams(ListAvailableDevelopmentsQuerySchema, {
      ...list,
      page: params[DEVELOPMENTS_PAGE_PARAM],
    }).value;
    const [summary, properties, developments] = await Promise.all([
      reporting.getPortfolioSummary.execute(filter, actor),
      reporting.listAvailableProperties.execute(propertiesQuery, actor),
      reporting.listAvailableDevelopments.execute(developmentsQuery, actor),
    ]);
    agentLabel = [
      ...(properties.isOk() ? properties.value.items : []),
      ...(developments.isOk() ? developments.value.items : []),
    ].find((row) => row.agent?.id === filter.agentId)?.agent?.name;
    content = (
      <PortfolioView
        summary={widgetState(summary)}
        properties={widgetState(properties)}
        developments={widgetState(developments)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Sin encabezado visible: el título queda para lectores de pantalla. */}
      <h1 className="sr-only">Inicio</h1>
      <HomeToolbar
        view={view}
        filters={filters}
        permissions={{
          pickUsers: actor.can('users:read'),
          pickBranches: actor.can('branches:read'),
        }}
        agentLabel={agentLabel}
      />
      {invalidKeys.length > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          Algunos filtros de la dirección no eran válidos ({invalidKeys.join(', ')}) y se quitaron.
        </p>
      )}
      {content}
    </div>
  );
}
