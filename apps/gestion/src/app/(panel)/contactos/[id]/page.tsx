import {
  ListClientActivityQuerySchema,
  ListClientFeaturedQuerySchema,
  ListClientHistoryQuerySchema,
  ListClientOpportunitiesQuerySchema,
  ListClientRelationsQuerySchema,
  ListClientSavedSearchesQuerySchema,
  type ClientDetail,
  type SavedSearchDetail,
} from '@norde/core/clients/contracts';
import {
  ListOwnedPropertiesQuerySchema,
  ListPanelPropertiesQuerySchema,
} from '@norde/core/properties/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { ArrowLeftIcon } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { getContainer } from '../../../../container';
import { ClientActivityTimeline } from '../../../../features/clients/components/client-activity-timeline';
import { ClientDetailHeader } from '../../../../features/clients/components/client-detail-header';
import { ClientDetailSections } from '../../../../features/clients/components/client-detail-sections';
import {
  ClientDetailTabs,
  type ClientDetailTab,
  type ClientDetailTabItem,
} from '../../../../features/clients/components/client-detail-tabs';
import { ClientHistoryGrid } from '../../../../features/clients/components/client-history-grid';
import { ClientNoteComposer } from '../../../../features/clients/components/client-note-composer';
import { ClientOfferProperties } from '../../../../features/clients/components/client-offer-properties';
import {
  ClientFeaturedGrid,
  ClientOpportunitiesGrid,
  ClientOwnedPropertiesGrid,
  ClientSavedSearchesGrid,
} from '../../../../features/clients/components/client-record-grids';
import { clientName } from '../../../../features/clients/client-format';
import {
  CLIENT_ACTIVITY_ERROR_MESSAGES,
  CLIENT_DETAIL_ERROR_MESSAGES,
  CLIENT_FEATURED_ERROR_MESSAGES,
  CLIENT_HISTORY_ERROR_MESSAGES,
  CLIENT_OPPORTUNITIES_ERROR_MESSAGES,
  CLIENT_SAVED_SEARCHES_ERROR_MESSAGES,
  GET_SAVED_SEARCH_ERROR_MESSAGES,
} from '../../../../features/clients/messages';
import { messageForError } from '../../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import { parsePanelParams, type PanelData } from '../../../../lib/panel-params';
import { requireSession } from '../../../../lib/session';

function tabFrom(params: SearchParams, available: readonly ClientDetailTab[]): ClientDetailTab {
  const raw = params.tab;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return available.find((tab) => tab === value) ?? 'detalles';
}

/** Solo los params de una pestaña: los de la ficha (`tab`) no llegan al contract de la query. */
function pick(params: SearchParams, keys: readonly string[]): SearchParams {
  return Object.fromEntries(keys.map((key) => [key, params[key]]));
}

const PAGING = ['page', 'pageSize', 'sort'] as const;

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<Metadata> {
  const { actor } = await requireSession();
  const { id } = await params;
  const detail = await getContainer().clients.getClientDetail.execute({ clientId: id }, actor);
  return { title: detail.isOk() ? `${clientName(detail.value.name)} · Contactos` : 'Contacto' };
}

export default async function ContactDetailPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { clients, properties, identity } = getContainer();
  const result = await clients.getClientDetail.execute({ clientId: id }, actor);
  if (result.isErr()) {
    if (result.error.type === 'ClientNotFound' || result.error.type === 'InvalidInput') {
      notFound();
    }
    // Se unificó con otro: los datos (y el historial de los dos) están en el principal.
    if (result.error.type === 'ClientMerged') {
      redirect(`/contactos/${result.error.clientId}` as Route);
    }
    return <DataTableError message={messageForError(result.error, CLIENT_DETAIL_ERROR_MESSAGES)} />;
  }
  const detail = result.value;
  const seesProperties = actor.can('properties:read');

  // El contador de "Propiedades" sale del módulo properties: una página de una fila.
  // Los estados y motivos, para cambiar el estado o cerrar la oportunidad desde la tarjeta.
  const opportunityActions = detail.activeOpportunity?.can;
  const actsOnOpportunity =
    opportunityActions !== undefined && (opportunityActions.update || opportunityActions.reassign);
  const [owned, favorites, opportunityConfig] = await Promise.all([
    seesProperties
      ? properties.listOwnedProperties.execute({ clientId: detail.id, pageSize: 1 }, actor)
      : undefined,
    identity.getFavoriteIds.execute({ entityType: 'client', ids: [detail.id] }, actor),
    actsOnOpportunity ? clients.getOpportunityConfiguration.execute(actor) : undefined,
  ]);
  const { counts } = detail;
  const tabs: readonly ClientDetailTabItem[] = [
    { id: 'detalles' },
    { id: 'actividad', count: counts.activity },
    { id: 'oportunidades', count: counts.opportunities },
    { id: 'destacadas', count: counts.featured },
    { id: 'busquedas', count: counts.savedSearches },
    ...(seesProperties
      ? [
          { id: 'propiedades' as const, count: owned?.isOk() ? owned.value.total : undefined },
          ...(detail.can.edit ? [{ id: 'ofrecer' as const }] : []),
        ]
      : []),
    ...(detail.can.viewHistory ? [{ id: 'historial' as const }] : []),
  ];
  const tab = tabFrom(
    query,
    tabs.map((item) => item.id),
  );

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/contactos"
        className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Volver a contactos
      </Link>

      <ClientDetailHeader
        detail={detail}
        canPickAgents={actor.can('users:read')}
        favorite={favorites.isOk() && favorites.value.has(detail.id)}
        opportunityCatalog={
          opportunityConfig?.isOk() === true ? opportunityConfig.value : undefined
        }
      />
      <ClientDetailTabs clientId={detail.id} active={tab} tabs={tabs} />

      <TabContent tab={tab} detail={detail} query={query} />
    </div>
  );
}

/** La pestaña activa: solo se consulta lo que se muestra. */
async function TabContent({
  tab,
  detail,
  query,
}: {
  readonly tab: ClientDetailTab;
  readonly detail: ClientDetail;
  readonly query: SearchParams;
}) {
  const { actor } = await requireSession();
  const { clients, properties } = getContainer();
  const clientId = detail.id;
  const card = (body: ReactNode) => <Card className="gap-0 overflow-hidden p-0">{body}</Card>;

  switch (tab) {
    case 'detalles': {
      const page = query.relPage;
      const { value: relationsQuery } = parseListParams(ListClientRelationsQuerySchema, {
        clientId,
        pageSize: '10',
        ...(page === undefined ? {} : { page }),
      });
      const relations = await clients.listClientRelations.execute(relationsQuery, actor);
      return (
        <ClientDetailSections
          detail={detail}
          relations={relations.isOk() ? relations.value : undefined}
        />
      );
    }
    case 'actividad': {
      const { value: activityQuery } = parseListParams(ListClientActivityQuerySchema, {
        ...pick(query, [...PAGING, 'kind']),
        clientId,
      });
      const page = await clients.listClientActivity.execute(activityQuery, actor);
      return (
        <div className="flex flex-col gap-4">
          {detail.can.edit && <ClientNoteComposer clientId={clientId} />}
          {card(
            page.isErr() ? (
              <DataTableError
                message={messageForError(page.error, CLIENT_ACTIVITY_ERROR_MESSAGES)}
              />
            ) : (
              <ClientActivityTimeline page={page.value} kind={activityQuery.kind} />
            ),
          )}
        </div>
      );
    }
    case 'oportunidades': {
      const { value: opportunitiesQuery } = parseListParams(ListClientOpportunitiesQuerySchema, {
        ...pick(query, PAGING),
        clientId,
      });
      const page = await clients.listClientOpportunities.execute(opportunitiesQuery, actor);
      return card(
        page.isErr() ? (
          <DataTableError
            message={messageForError(page.error, CLIENT_OPPORTUNITIES_ERROR_MESSAGES)}
          />
        ) : (
          <ClientOpportunitiesGrid page={page.value} sort={opportunitiesQuery.sort} />
        ),
      );
    }
    case 'destacadas': {
      const { value: featuredQuery } = parseListParams(ListClientFeaturedQuerySchema, {
        ...pick(query, PAGING),
        clientId,
      });
      const page = await clients.listClientFeatured.execute(featuredQuery, actor);
      return card(
        page.isErr() ? (
          <DataTableError message={messageForError(page.error, CLIENT_FEATURED_ERROR_MESSAGES)} />
        ) : (
          <ClientFeaturedGrid clientId={clientId} page={page.value} canEdit={detail.can.edit} />
        ),
      );
    }
    case 'busquedas': {
      const { value: searchesQuery } = parseListParams(ListClientSavedSearchesQuerySchema, {
        ...pick(query, [...PAGING, 'view']),
        clientId,
      });
      const panel = parsePanelParams(query);
      const [page, searchPanel] = await Promise.all([
        clients.listClientSavedSearches.execute(searchesQuery, actor),
        panel?.kind === 'edit'
          ? clients.getSavedSearch.execute({ clientId, savedSearchId: panel.id }, actor)
          : undefined,
      ]);
      const detailPanel: PanelData<SavedSearchDetail> | undefined =
        panel?.kind !== 'edit' || searchPanel === undefined
          ? undefined
          : searchPanel.isOk()
            ? { id: panel.id, ok: true, value: searchPanel.value }
            : {
                id: panel.id,
                ok: false,
                message: messageForError(searchPanel.error, GET_SAVED_SEARCH_ERROR_MESSAGES),
              };
      return card(
        page.isErr() ? (
          <DataTableError
            message={messageForError(page.error, CLIENT_SAVED_SEARCHES_ERROR_MESSAGES)}
          />
        ) : (
          <ClientSavedSearchesGrid
            clientId={clientId}
            page={page.value}
            sort={searchesQuery.sort}
            view={searchesQuery.view}
            canEdit={detail.can.edit}
            detail={detailPanel}
            activeOpportunityId={detail.activeOpportunity?.id}
          />
        ),
      );
    }
    case 'propiedades': {
      const { value: ownedQuery } = parseListParams(ListOwnedPropertiesQuerySchema, {
        ...pick(query, PAGING),
        clientId,
      });
      const page = await properties.listOwnedProperties.execute(ownedQuery, actor);
      return card(
        page.isErr() ? (
          <DataTableError message={messageForError(page.error)} />
        ) : (
          <ClientOwnedPropertiesGrid page={page.value} sort={ownedQuery.sort} />
        ),
      );
    }
    case 'ofrecer': {
      // La cartera activa de Norde, con los filtros básicos del buscador.
      const { value: offerQuery } = parseListParams(
        ListPanelPropertiesQuerySchema,
        pick(query, [...PAGING, 'q', 'operation', 'propertyType']),
      );
      const page = await properties.listPanelProperties.execute(offerQuery, actor);
      if (page.isErr()) return card(<DataTableError message={messageForError(page.error)} />);
      const featured = await clients.getFeaturedPropertyIds.execute(
        { clientId, propertyIds: page.value.items.map((row) => row.id) },
        actor,
      );
      return card(
        <ClientOfferProperties
          clientId={clientId}
          page={page.value}
          sort={offerQuery.sort}
          filters={{
            q: offerQuery.q,
            operation: offerQuery.operation,
            propertyType: offerQuery.propertyType,
          }}
          featuredIds={featured.isOk() ? [...featured.value] : []}
          canFeature={detail.can.edit}
        />,
      );
    }
    case 'historial': {
      const { value: historyQuery } = parseListParams(ListClientHistoryQuerySchema, {
        ...pick(query, [...PAGING, 'from', 'to']),
        clientId,
      });
      const page = await clients.listClientHistory.execute(historyQuery, actor);
      return card(
        page.isErr() ? (
          <DataTableError message={messageForError(page.error, CLIENT_HISTORY_ERROR_MESSAGES)} />
        ) : (
          <ClientHistoryGrid page={page.value} from={historyQuery.from} to={historyQuery.to} />
        ),
      );
    }
  }
}
