import { canActOn, OWNERSHIP_RULES } from '@norde/core/identity';
import {
  ListPropertyAttachmentsQuerySchema,
  ListPropertyHistoryQuerySchema,
  ListPropertyMediaQuerySchema,
  type PanelPropertyDetail,
} from '@norde/core/properties/contracts';
import {
  PropertyInterestQuerySchema,
  PropertySendsQuerySchema,
} from '@norde/core/clients/contracts';
import { PropertyStatisticsQuerySchema } from '@norde/core/reporting/contracts';
import type { SessionActor } from '@norde/core/identity';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { ArrowLeftIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { companyFeatures } from '../../../../config/env';
import { getContainer } from '../../../../container';
import { AttachmentsGrid } from '../../../../features/properties/components/detail/attachments-grid';
import { DetailSections } from '../../../../features/properties/components/detail/detail-sections';
import { DetailTabs } from '../../../../features/properties/components/detail/detail-tabs';
import { HistoryGrid } from '../../../../features/properties/components/detail/history-grid';
import {
  InterestedGrid,
  SendsGrid,
} from '../../../../features/properties/components/detail/contacts-grids';
import { MediaGallery } from '../../../../features/properties/components/detail/media-gallery';
import { PropertyDetailHeader } from '../../../../features/properties/components/detail/property-detail-header';
import { StatisticsView } from '../../../../features/properties/components/detail/statistics-view';
import type { DetailPermissions } from '../../../../features/properties/components/detail/permissions';
import { DETAIL_TABS, type DetailTab } from '../../../../features/properties/detail-labels';
import {
  DETAIL_LIST_ERROR_MESSAGES,
  DETAIL_READ_ERROR_MESSAGES,
} from '../../../../features/properties/detail-messages';
import { messageForError } from '../../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import { requireSession } from '../../../../lib/session';

/** Ítems por tipo del catálogo que se ofrecen como checklist en la ficha. */
const FEATURES_PAGE = 100;
/** La galería entera: una propiedad tiene como mucho 100 ítems. */
const GALLERY_PAGE = 100;

function first(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function tabFrom(params: SearchParams): DetailTab {
  const value = first(params, 'tab');
  return DETAIL_TABS.find((tab) => tab === value) ?? 'detalles';
}

function permissionsFor(
  actor: SessionActor['actor'],
  detail: PanelPropertyDetail,
): DetailPermissions {
  const ownership = { ownerId: detail.producer?.id, ownerBranchId: detail.branchId };
  const edit =
    detail.deletedAt === undefined && canActOn(actor, OWNERSHIP_RULES.propertiesUpdate, ownership);
  return {
    edit,
    publish: edit && actor.can('properties:publish'),
    changeProducer: edit && actor.can('properties:change-producer'),
    markAvailable: actor.can('properties:mark-available'),
    export: actor.can('properties:export'),
    history: canActOn(actor, OWNERSHIP_RULES.auditRead, ownership),
    contacts:
      actor.can('clients:read') ||
      actor.can('clients:read-branch') ||
      actor.can('clients:read-all'),
  };
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<Metadata> {
  const { actor } = await requireSession();
  const { id } = await params;
  const detail = await getContainer().properties.getPanelPropertyDetail.execute(
    { propertyId: id },
    actor,
  );
  return { title: detail.isOk() ? `${detail.value.code} · Propiedades` : 'Propiedad' };
}

export default async function PropertyDetailPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<SearchParams>;
}) {
  const session = await requireSession();
  const { actor } = session;
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const container = getContainer();
  const result = await container.properties.getPanelPropertyDetail.execute(
    { propertyId: id },
    actor,
  );
  if (result.isErr()) {
    if (result.error.type === 'PropertyNotFound' || result.error.type === 'InvalidInput') {
      notFound();
    }
    return <DataTableError message={messageForError(result.error, DETAIL_READ_ERROR_MESSAGES)} />;
  }
  const detail = result.value;
  const tab = tabFrom(query);
  const permissions = permissionsFor(actor, detail);
  const favorites = await container.identity.getFavoriteIds.execute(
    { entityType: 'property', ids: [detail.id] },
    actor,
  );

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/propiedades"
        className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Volver a propiedades
      </Link>

      <PropertyDetailHeader
        detail={detail}
        permissions={permissions}
        favorite={favorites.isOk() && favorites.value.has(detail.id)}
      />
      <DetailTabs propertyId={detail.id} active={tab} counts={detail.counts} />

      {await renderTab(tab, detail, permissions, actor, query)}
    </div>
  );
}

async function renderTab(
  tab: DetailTab,
  detail: PanelPropertyDetail,
  permissions: DetailPermissions,
  actor: SessionActor['actor'],
  query: SearchParams,
) {
  const { properties, clients, reporting } = getContainer();
  const propertyId = detail.id;

  switch (tab) {
    case 'detalles': {
      const [configuration, ...features] = await Promise.all([
        properties.getPropertyConfiguration.execute(actor),
        ...(['service', 'room', 'amenity'] as const).map((kind) =>
          properties.listFeatures.execute(
            { kind, state: 'active', pageSize: FEATURES_PAGE, sort: 'position' },
            actor,
          ),
        ),
      ]);
      const type = configuration.isOk()
        ? configuration.value.types.find((setting) => setting.propertyType === detail.propertyType)
        : undefined;
      return (
        <DetailSections
          detail={detail}
          permissions={permissions}
          visibleAttributes={type?.visibleAttributes ?? []}
          catalog={features.flatMap((page) => (page.isOk() ? page.value.items : []))}
          catalogTruncated={features.some(
            (page) => page.isOk() && page.value.total > page.value.items.length,
          )}
          showCustomAttributes={companyFeatures().customAttributes}
        />
      );
    }
    case 'multimedia': {
      const { value } = parseListParams(ListPropertyMediaQuerySchema, {
        propertyId,
        pageSize: String(GALLERY_PAGE),
      });
      const gallery = await properties.listPropertyMedia.execute(value, actor);
      if (gallery.isErr()) return <TabError error={gallery.error} />;
      return (
        <MediaGallery
          propertyId={propertyId}
          items={gallery.value.items}
          canEdit={permissions.edit}
        />
      );
    }
    case 'archivos': {
      const { value } = parseListParams(ListPropertyAttachmentsQuerySchema, {
        ...query,
        propertyId,
      });
      const page = await properties.listPropertyAttachments.execute(value, actor);
      if (page.isErr()) return <TabError error={page.error} />;
      return (
        <Card className="gap-0 overflow-hidden p-0">
          <AttachmentsGrid
            propertyId={propertyId}
            page={page.value}
            sort={value.sort}
            canEdit={permissions.edit}
          />
        </Card>
      );
    }
    case 'historial': {
      if (!permissions.history) return <TabError error={{ type: 'Forbidden' }} />;
      const { value } = parseListParams(ListPropertyHistoryQuerySchema, { ...query, propertyId });
      const page = await properties.listPropertyHistory.execute(value, actor);
      if (page.isErr()) return <TabError error={page.error} />;
      return (
        <Card className="gap-0 overflow-hidden p-0">
          <HistoryGrid
            page={page.value}
            category={value.category}
            from={value.from}
            to={value.to}
          />
        </Card>
      );
    }
    case 'contactos': {
      if (!permissions.contacts) return <TabError error={{ type: 'Forbidden' }} />;
      const view = first(query, 'vista') === 'envios' ? 'envios' : 'interesados';
      if (view === 'envios') {
        const { value } = parseListParams(PropertySendsQuerySchema, { ...query, propertyId });
        const page = await clients.listPropertySends.execute(value, actor);
        if (page.isErr()) return <TabError error={page.error} />;
        return (
          <Card className="gap-0 overflow-hidden p-0">
            <SendsGrid propertyId={propertyId} page={page.value} />
          </Card>
        );
      }
      const { value } = parseListParams(PropertyInterestQuerySchema, { ...query, propertyId });
      const page = await clients.listPropertyInterestedClients.execute(value, actor);
      if (page.isErr()) return <TabError error={page.error} />;
      return (
        <Card className="gap-0 overflow-hidden p-0">
          <InterestedGrid propertyId={propertyId} page={page.value} />
        </Card>
      );
    }
    case 'estadisticas': {
      const { value } = parseListParams(PropertyStatisticsQuerySchema, {
        propertyId,
        months: first(query, 'meses'),
      });
      const statistics = await reporting.getPropertyStatistics.execute(value, actor);
      if (statistics.isErr()) return <TabError error={statistics.error} />;
      return <StatisticsView statistics={statistics.value} months={value.months} />;
    }
  }
}

function TabError({ error }: { readonly error: { readonly type: string } }) {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <DataTableError message={messageForError(error, DETAIL_LIST_ERROR_MESSAGES)} />
    </Card>
  );
}
