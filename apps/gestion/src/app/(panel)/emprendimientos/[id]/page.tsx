import { canActOn, OWNERSHIP_RULES, type SessionActor } from '@norde/core/identity';
import {
  ListDevelopmentHistoryQuerySchema,
  ListPanelPropertiesQuerySchema,
  type DevelopmentDetail,
  type PropertyType,
} from '@norde/core/properties/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { ArrowLeftIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getContainer } from '../../../../container';
import {
  DevelopmentDetailHeader,
  type DevelopmentDetailPermissions,
} from '../../../../features/developments/components/development-detail-header';
import { DevelopmentHistoryGrid } from '../../../../features/developments/components/development-history-grid';
import { DevelopmentSections } from '../../../../features/developments/components/development-sections';
import { DevelopmentTabs } from '../../../../features/developments/components/development-tabs';
import { UnitsGrid } from '../../../../features/developments/components/units-grid';
import { DEVELOPMENT_TABS, type DevelopmentTab } from '../../../../features/developments/labels';
import { DEVELOPMENT_READ_ERROR_MESSAGES } from '../../../../features/developments/messages';
import { PROPERTY_LIST_ERROR_MESSAGES } from '../../../../features/properties/messages';
import { messageForError } from '../../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import { requireSession } from '../../../../lib/session';

/** Ítems por tipo del catálogo que se ofrecen como checklist en la ficha. */
const FEATURES_PAGE = 100;

function first(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function tabFrom(params: SearchParams): DevelopmentTab {
  const value = first(params, 'tab');
  return DEVELOPMENT_TABS.find((tab) => tab === value) ?? 'detalles';
}

function permissionsFor(
  actor: SessionActor['actor'],
  detail: DevelopmentDetail,
): DevelopmentDetailPermissions {
  const ownership = { ownerId: detail.producer?.id, ownerBranchId: detail.branchId };
  const edit =
    detail.deletedAt === undefined &&
    canActOn(actor, OWNERSHIP_RULES.developmentsUpdate, ownership);
  return {
    edit,
    delete: actor.can('developments:delete'),
    addUnits: edit && actor.can('properties:create'),
    history: canActOn(actor, OWNERSHIP_RULES.auditRead, ownership),
  };
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<Metadata> {
  const { actor } = await requireSession();
  const { id } = await params;
  const detail = await getContainer().properties.getDevelopmentDetail.execute(
    { developmentId: id },
    actor,
  );
  return { title: detail.isOk() ? `${detail.value.name} · Emprendimientos` : 'Emprendimiento' };
}

export default async function DevelopmentDetailPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const result = await getContainer().properties.getDevelopmentDetail.execute(
    { developmentId: id },
    actor,
  );
  if (result.isErr()) {
    if (result.error.type === 'DevelopmentNotFound' || result.error.type === 'InvalidInput') {
      notFound();
    }
    return (
      <DataTableError message={messageForError(result.error, DEVELOPMENT_READ_ERROR_MESSAGES)} />
    );
  }
  const detail = result.value;
  const tab = tabFrom(query);
  const permissions = permissionsFor(actor, detail);

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/emprendimientos"
        className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Volver a emprendimientos
      </Link>

      <DevelopmentDetailHeader detail={detail} permissions={permissions} />
      <DevelopmentTabs
        developmentId={detail.id}
        active={tab}
        unitCount={detail.unitCount}
        showHistory={permissions.history}
      />

      {await renderTab(tab, detail, permissions, actor, query)}
    </div>
  );
}

async function renderTab(
  tab: DevelopmentTab,
  detail: DevelopmentDetail,
  permissions: DevelopmentDetailPermissions,
  actor: SessionActor['actor'],
  query: SearchParams,
) {
  const { properties } = getContainer();
  const developmentId = detail.id;

  switch (tab) {
    case 'detalles': {
      const features = await Promise.all(
        (['service', 'amenity'] as const).map((kind) =>
          properties.listFeatures.execute(
            { kind, state: 'active', pageSize: FEATURES_PAGE, sort: 'position' },
            actor,
          ),
        ),
      );
      return (
        <DevelopmentSections
          detail={detail}
          canEdit={permissions.edit}
          catalog={features.flatMap((page) => (page.isOk() ? page.value.items : []))}
          catalogTruncated={features.some(
            (page) => page.isOk() && page.value.total > page.value.items.length,
          )}
        />
      );
    }
    case 'unidades': {
      const { value } = parseListParams(ListPanelPropertiesQuerySchema, {
        ...query,
        developmentId,
      });
      const [page, configuration] = await Promise.all([
        properties.listPanelProperties.execute(value, actor),
        properties.getPropertyConfiguration.execute(actor),
      ]);
      if (page.isErr()) {
        return (
          <Card className="gap-0 overflow-hidden p-0">
            <DataTableError message={messageForError(page.error, PROPERTY_LIST_ERROR_MESSAGES)} />
          </Card>
        );
      }
      const enabledTypes: readonly PropertyType[] = configuration.isOk()
        ? configuration.value.types
            .filter((type) => type.isEnabled)
            .map((type) => type.propertyType)
        : [];
      return (
        <Card className="gap-0 overflow-hidden p-0">
          <UnitsGrid
            developmentId={developmentId}
            page={page.value}
            sort={value.sort}
            canAdd={permissions.addUnits}
            enabledTypes={enabledTypes}
          />
        </Card>
      );
    }
    case 'historial': {
      if (!permissions.history) {
        return (
          <Card className="gap-0 overflow-hidden p-0">
            <DataTableError
              message={messageForError({ type: 'Forbidden' }, DEVELOPMENT_READ_ERROR_MESSAGES)}
            />
          </Card>
        );
      }
      const { value } = parseListParams(ListDevelopmentHistoryQuerySchema, {
        ...query,
        developmentId,
      });
      const page = await properties.listDevelopmentHistory.execute(value, actor);
      if (page.isErr()) {
        return (
          <Card className="gap-0 overflow-hidden p-0">
            <DataTableError
              message={messageForError(page.error, DEVELOPMENT_READ_ERROR_MESSAGES)}
            />
          </Card>
        );
      }
      return (
        <Card className="gap-0 overflow-hidden p-0">
          <DevelopmentHistoryGrid
            page={page.value}
            category={value.category}
            from={value.from}
            to={value.to}
          />
        </Card>
      );
    }
  }
}
