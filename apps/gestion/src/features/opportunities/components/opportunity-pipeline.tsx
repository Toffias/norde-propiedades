'use client';

import {
  CONTACT_CHANNEL_LABELS,
  OPPORTUNITY_STATUS_LABELS,
  OPPORTUNITY_TYPE_LABELS,
  REFERRAL_RESULT_LABELS,
  type OpportunityBulkFilter,
  type OpportunityPipelineRow,
  type OpportunityReferralView,
  type OpportunityStageCount,
  type OpportunityStageRow,
} from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import { Checkbox } from '@norde/ui/components/checkbox';
import { SoftBadge } from '@norde/ui/components/status-pill';
import { TablePagination } from '@norde/ui/components/table-pagination';
import { cn } from '@norde/ui/lib/utils';
import { ChevronDownIcon, Loader2Icon, LockIcon, MessageCircleIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { EMPTY_VALUE, formatDateOnly, formatDateTime } from '../../../lib/format';
import { clientName, formatPhone, userName, whatsappHref } from '../../clients/client-format';
import {
  ListNavigationProvider,
  useListNavigation,
} from '../../shared/components/server-data-table';

import { ColorDot } from './catalog-pieces';
import { OpportunityActionsMenu, type OpportunityCatalogView } from './opportunity-actions';
import { OpportunityBulkDialog, type OpportunityBulkPermissions } from './opportunity-bulk-dialog';
import {
  contactHref,
  daysLabel,
  OpportunitySortSelect,
  PipelineToolbar,
  type OpportunitySort,
  type OpportunityView,
} from './opportunity-view-controls';

/** La sección abierta: las oportunidades de un estado, en una página. */
export interface OpportunitySection {
  readonly stageId: string;
  readonly rows: readonly OpportunityPipelineRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: OpportunitySort;
}

/** Las acciones masivas de la sección: el filtro de la pantalla y qué se puede ofrecer. */
export interface OpportunityBulkContext {
  readonly filter: OpportunityBulkFilter;
  readonly permissions: OpportunityBulkPermissions;
}

/** "Derivada a Inmobiliaria Sur · 20/02/2026 · Volvió a Norde". */
function ReferralLine({ referral }: { readonly referral: OpportunityReferralView }) {
  const parts = [
    referral.partnerName === undefined ? 'Sin socia cargada' : `Derivada a ${referral.partnerName}`,
    referral.referredAt === undefined ? undefined : formatDateOnly(referral.referredAt),
    referral.result === undefined ? undefined : REFERRAL_RESULT_LABELS[referral.result],
  ];
  return (
    <p className="text-xs text-muted-foreground">
      {parts.filter((part) => part !== undefined).join(' · ')}
    </p>
  );
}

function OpportunityLine({
  row,
  catalog,
  canPickAgents,
  selection,
}: {
  readonly row: OpportunityPipelineRow;
  readonly catalog: OpportunityCatalogView;
  readonly canPickAgents: boolean;
  /** Con acciones masivas: si está marcada y cómo marcarla. */
  readonly selection:
    { readonly checked: boolean; readonly onChange: (checked: boolean) => void } | undefined;
}) {
  const name = clientName(row.client.name);
  const phone = row.client.phone;
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
      {selection !== undefined && (
        <Checkbox
          className="mt-0.5"
          checked={selection.checked}
          aria-label={`Seleccionar la oportunidad de ${name}`}
          onCheckedChange={(checked) => {
            selection.onChange(checked === true);
          }}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={contactHref(row.client.id)}
            className="truncate text-sm font-medium hover:underline"
          >
            {name}
          </Link>
          <SoftBadge>{OPPORTUNITY_TYPE_LABELS[row.type] ?? row.type}</SoftBadge>
          {row.property !== undefined && (
            <Link
              // La ficha de la propiedad: typedRoutes no verifica un string armado.
              href={`/propiedades/${row.property.id}` as Route}
              className="max-w-[260px] truncate text-xs text-primary hover:underline"
              title={row.property.title}
            >
              {row.property.code} · {row.property.title}
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 tabular-nums">
            {row.client.contactMasked && (
              <LockIcon className="h-3 w-3" aria-label="Datos de propietario" />
            )}
            {phone === undefined
              ? EMPTY_VALUE
              : row.client.contactMasked
                ? phone
                : formatPhone(phone)}
          </span>
          <span>{CONTACT_CHANNEL_LABELS[row.originChannel] ?? row.originChannel}</span>
          <span>{row.agent === undefined ? 'Sin agente' : userName(row.agent)}</span>
          <span title={`Actualizada el ${formatDateTime(row.updatedAt)}`}>
            Act. {formatDateTime(row.updatedAt)}
          </span>
        </div>
        {row.referral !== undefined && <ReferralLine referral={row.referral} />}
        {row.lastNote !== undefined && (
          <p className="line-clamp-2 text-xs text-muted-foreground italic">“{row.lastNote}”</p>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <span
          className="text-xs whitespace-nowrap text-muted-foreground tabular-nums"
          title={`En este estado desde el ${formatDateTime(row.statusChangedAt)}`}
        >
          {daysLabel(row.daysInStage)} en el estado
        </span>
        <div className="flex items-center gap-0.5">
          {!row.client.contactMasked && phone !== undefined && (
            <a
              href={whatsappHref(phone)}
              target="_blank"
              rel="noreferrer"
              aria-label={`WhatsApp a ${name}`}
              title="WhatsApp"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <MessageCircleIcon className="h-4 w-4" />
            </a>
          )}
          <OpportunityActionsMenu
            target={{
              id: row.id,
              clientName: name,
              agent: row.agent,
              can: row.can,
              referral: row.referral,
            }}
            catalog={catalog}
            canPickAgents={canPickAgents}
          />
        </div>
      </div>
    </li>
  );
}

function SectionPanel({
  section,
  catalog,
  canPickAgents,
  bulk,
}: {
  readonly section: OpportunitySection;
  readonly catalog: OpportunityCatalogView;
  readonly canPickAgents: boolean;
  readonly bulk: OpportunityBulkContext | undefined;
}) {
  const { setParams, pending } = useListNavigation();
  // Las marcadas de esta página, o todas las del estado con los filtros.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const pageIds = section.rows.map((row) => row.id);
  const pageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const count = allMatching ? section.total : selected.size;

  function toggle(id: string, checked: boolean) {
    setAllMatching(false);
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function clear() {
    setSelected(new Set());
    setAllMatching(false);
  }

  return (
    <div className={cn('border-t border-border', pending && 'opacity-60')}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
        {bulk === undefined || section.rows.length === 0 ? (
          <span />
        ) : (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={pageSelected}
              aria-label="Seleccionar las de esta página"
              onCheckedChange={(checked) => {
                setAllMatching(false);
                setSelected(checked === true ? new Set(pageIds) : new Set());
              }}
            />
            Página
          </label>
        )}
        <OpportunitySortSelect sort={section.sort} />
      </div>
      {bulk !== undefined && count > 0 && (
        <div
          role="region"
          aria-label="Selección"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-muted/50 px-4 py-2 text-sm"
        >
          <span className="font-medium tabular-nums">
            {count.toLocaleString('es-AR')} {count === 1 ? 'seleccionada' : 'seleccionadas'}
          </span>
          {pageSelected && !allMatching && section.total > pageIds.length && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => {
                setAllMatching(true);
              }}
            >
              Seleccionar las {section.total.toLocaleString('es-AR')} de este estado
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={clear}>
              Quitar selección
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setDialogOpen(true);
              }}
            >
              Cambiar…
            </Button>
          </div>
        </div>
      )}
      {section.rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          No hay oportunidades en esta página.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {section.rows.map((row) => (
            <OpportunityLine
              key={row.id}
              row={row}
              catalog={catalog}
              canPickAgents={canPickAgents}
              selection={
                bulk === undefined
                  ? undefined
                  : {
                      checked: allMatching || selected.has(row.id),
                      onChange: (checked) => {
                        toggle(row.id, checked);
                      },
                    }
              }
            />
          ))}
        </ul>
      )}
      {section.total > section.pageSize && (
        <div className="border-t border-border px-4 py-2">
          <TablePagination
            page={section.page}
            pageSize={section.pageSize}
            total={section.total}
            onPageChange={(page) => {
              setParams({ page });
            }}
            onPageSizeChange={(pageSize) => {
              setParams({ pageSize });
            }}
          />
        </div>
      )}
      {bulk !== undefined && dialogOpen && (
        <OpportunityBulkDialog
          selection={
            allMatching
              ? { kind: 'filter', filter: { ...bulk.filter, stageId: section.stageId } }
              : { kind: 'ids', ids: [...selected] }
          }
          count={count}
          catalog={catalog}
          permissions={bulk.permissions}
          open
          onOpenChange={(open) => {
            if (open) return;
            setDialogOpen(false);
            clear();
          }}
        />
      )}
    </div>
  );
}

function PipelineBody({
  stages,
  counts,
  section,
  catalog,
  canPickAgents,
  bulk,
  view,
  toolbar,
}: {
  readonly stages: readonly OpportunityStageRow[];
  readonly counts: readonly OpportunityStageCount[];
  readonly section: OpportunitySection | undefined;
  readonly catalog: OpportunityCatalogView;
  readonly canPickAgents: boolean;
  readonly bulk: OpportunityBulkContext | undefined;
  readonly view: Exclude<OpportunityView, 'board'>;
  readonly toolbar: ReactNode;
}) {
  const { setParams, pending } = useListNavigation();
  const countOf = new Map(counts.map((item) => [item.stageId, item.count]));
  // Los activos siempre; los desactivados, solo si todavía tienen oportunidades.
  const shown = stages.filter((stage) => stage.isActive || (countOf.get(stage.id) ?? 0) > 0);
  const total = counts.reduce((sum, item) => sum + item.count, 0);

  function open(stageId: string) {
    // Otra sección arranca en su página 1, con el orden por defecto.
    if (stageId !== section?.stageId) setParams({ stageId, sort: undefined });
  }

  return (
    <div className="flex flex-col">
      <PipelineToolbar view={view}>{toolbar}</PipelineToolbar>
      <nav aria-label="Oportunidades por estado" className="border-b border-border px-3 py-3">
        <ul className="flex flex-wrap gap-2">
          {shown.map((stage) => {
            const count = countOf.get(stage.id) ?? 0;
            const active = section?.stageId === stage.id;
            return (
              <li key={stage.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  title={`${stage.name} (${OPPORTUNITY_STATUS_LABELS[stage.category]}): ${count.toLocaleString('es-AR')}`}
                  className={cn(
                    'inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    active
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-card hover:bg-accent',
                    count === 0 && !active && 'text-muted-foreground',
                  )}
                  onClick={() => {
                    open(stage.id);
                  }}
                >
                  <ColorDot color={stage.color} className="h-2.5 w-2.5" />
                  <span className="max-w-[160px] truncate">{stage.name}</span>
                  <span className="font-semibold tabular-nums">
                    {count.toLocaleString('es-AR')}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      {total === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          No hay oportunidades con estos filtros.
        </p>
      ) : (
        <ul aria-busy={pending} className="divide-y divide-border">
          {shown.map((stage) => {
            const expanded = section?.stageId === stage.id;
            const count = countOf.get(stage.id) ?? 0;
            return (
              <li key={stage.id}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  onClick={() => {
                    open(stage.id);
                  }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <ColorDot color={stage.color} />
                    <span className="truncate text-base font-semibold">{stage.name}</span>
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {OPPORTUNITY_STATUS_LABELS[stage.category]}
                      {!stage.isActive && ' · desactivado'}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
                    {count.toLocaleString('es-AR')}
                    {pending && expanded ? (
                      <Loader2Icon className="h-4 w-4 animate-spin" />
                    ) : (
                      <ChevronDownIcon
                        className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')}
                      />
                    )}
                  </span>
                </button>
                {expanded && (
                  <SectionPanel
                    // Otra página, otro orden u otros filtros: la selección arranca vacía.
                    key={`${section.stageId}:${String(section.page)}:${String(section.pageSize)}:${section.sort.field}:${section.sort.direction}:${JSON.stringify(bulk?.filter ?? {})}`}
                    section={section}
                    catalog={catalog}
                    canPickAgents={canPickAgents}
                    bulk={bulk}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * El pipeline en lista: un contador por estado (con los filtros aplicados) y un acordeón con una
 * sección por estado. Solo la sección abierta trae sus oportunidades, paginadas en el servidor.
 */
export function OpportunityPipeline(props: {
  readonly stages: readonly OpportunityStageRow[];
  readonly counts: readonly OpportunityStageCount[];
  readonly section: OpportunitySection | undefined;
  readonly catalog: OpportunityCatalogView;
  readonly canPickAgents: boolean;
  /** Sin permiso para ninguna acción masiva, no hay selección. */
  readonly bulk: OpportunityBulkContext | undefined;
  readonly view: Exclude<OpportunityView, 'board'>;
  readonly toolbar: ReactNode;
}) {
  return (
    <ListNavigationProvider>
      <PipelineBody {...props} />
    </ListNavigationProvider>
  );
}
