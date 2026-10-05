'use client';

import {
  CONTACT_CHANNEL_LABELS,
  OPPORTUNITY_STATUS_LABELS,
  OPPORTUNITY_TYPE_LABELS,
  REFERRAL_RESULT_LABELS,
  type ListOpportunitiesQuery,
  type OpportunityBulkFilter,
  type OpportunityPipelineRow,
  type OpportunityReferralView,
  type OpportunityStageCount,
  type OpportunityStageRow,
} from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import { Checkbox } from '@norde/ui/components/checkbox';
import { SoftBadge } from '@norde/ui/components/status-pill';
import { cn } from '@norde/ui/lib/utils';
import { ChevronDownIcon, Loader2Icon, LockIcon } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { EMPTY_VALUE, formatDateOnly, formatDateTime } from '../../../lib/format';
import { clientName, formatPhone, userName } from '../../clients/client-format';
import {
  ListNavigationProvider,
  useListNavigation,
} from '../../shared/components/server-data-table';
import { loadOpportunityColumnAction } from '../pipeline-actions';

import { ColorDot, stageTint } from './catalog-pieces';
import { OpportunityActionsMenu, type OpportunityCatalogView } from './opportunity-actions';
import { OpportunityBulkDialog, type OpportunityBulkPermissions } from './opportunity-bulk-dialog';
import { OpportunityHistoryDialog, OpportunityNoteDialog } from './opportunity-card-dialogs';
import {
  ContactInitials,
  OpportunityQuickActions,
  opportunityTarget,
  PropertyLink,
  type OpportunityDialog,
} from './opportunity-row-pieces';
import {
  contactHref,
  daysLabel,
  PipelineToolbar,
  type OpportunitySort,
} from './opportunity-view-controls';

/** La sección abierta: la primera página de un estado. "Ver más" trae las siguientes. */
export interface OpportunitySection {
  readonly stageId: string;
  readonly rows: readonly OpportunityPipelineRow[];
  readonly total: number;
  /** La consulta de la primera página: la siguiente usa la misma, con otra página. */
  readonly query: ListOpportunitiesQuery & {
    readonly page: number;
    readonly sort: OpportunitySort;
  };
}

/** Las páginas que se sumaron con "Ver más". */
interface LoadedMore {
  readonly rows: readonly OpportunityPipelineRow[];
  readonly pages: number;
  readonly total: number;
  readonly loading: boolean;
  readonly error: string | undefined;
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
  onDialog,
}: {
  readonly row: OpportunityPipelineRow;
  readonly catalog: OpportunityCatalogView;
  readonly canPickAgents: boolean;
  /** Con acciones masivas: si está marcada y cómo marcarla. */
  readonly selection:
    { readonly checked: boolean; readonly onChange: (checked: boolean) => void } | undefined;
  readonly onDialog: (row: OpportunityPipelineRow, dialog: OpportunityDialog) => void;
}) {
  const name = clientName(row.client.name);
  const phone = row.client.phone;
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {selection !== undefined && (
          <Checkbox
            className="mt-3.5"
            checked={selection.checked}
            aria-label={`Seleccionar la oportunidad de ${name}`}
            onCheckedChange={(checked) => {
              selection.onChange(checked === true);
            }}
          />
        )}
        <ContactInitials name={name} />
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
              <PropertyLink property={row.property} className="max-w-[280px]" />
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
      </div>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <span
          className="text-xs whitespace-nowrap text-muted-foreground tabular-nums"
          title={`En este estado desde el ${formatDateTime(row.statusChangedAt)}`}
        >
          {daysLabel(row.daysInStage)} en el estado
        </span>
        <div className="flex items-center gap-0.5">
          <OpportunityQuickActions row={row} onDialog={onDialog} />
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

/** La cabecera de un estado: abre o colapsa su sección. `leading` va a la izquierda (la selección). */
function StageHeader({
  stage,
  count,
  expanded,
  loading,
  leading,
  onToggle,
}: {
  readonly stage: OpportunityStageRow;
  readonly count: number;
  readonly expanded: boolean;
  readonly loading: boolean;
  readonly leading: ReactNode;
  readonly onToggle: () => void;
}) {
  return (
    <div style={{ backgroundColor: stageTint(stage.color, 8) }}>
      <div className="flex items-center gap-3 px-4 transition-colors hover:bg-foreground/[0.03]">
        {leading}
        <button
          type="button"
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-sm py-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onClick={onToggle}
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
            {loading ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <ChevronDownIcon
                className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')}
              />
            )}
          </span>
        </button>
      </div>
    </div>
  );
}

/** El lugar del checkbox en las cabeceras sin selección: así los estados quedan alineados. */
function SelectionSpacer() {
  return <span aria-hidden className="w-4 shrink-0" />;
}

/** El estado abierto: su cabecera (con "seleccionar las cargadas") y sus oportunidades. */
function ExpandedStage({
  stage,
  count,
  section,
  catalog,
  canPickAgents,
  bulk,
}: {
  readonly stage: OpportunityStageRow;
  readonly count: number;
  readonly section: OpportunitySection;
  readonly catalog: OpportunityCatalogView;
  readonly canPickAgents: boolean;
  readonly bulk: OpportunityBulkContext | undefined;
}) {
  const { pending } = useListNavigation();
  // Se colapsa sin navegar: sus filas ya están cargadas. Otra sección arranca abierta.
  const [collapsed, setCollapsed] = useState(false);
  const [more, setMore] = useState<LoadedMore>({
    rows: [],
    pages: section.query.page,
    total: section.total,
    loading: false,
    error: undefined,
  });
  // Las marcadas entre las cargadas, o todas las del estado con los filtros.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rowDialog, setRowDialog] = useState<
    { readonly row: OpportunityPipelineRow; readonly kind: OpportunityDialog } | undefined
  >();
  // Si algo se movió entre una página y la siguiente, una fila puede repetirse: va una vez.
  const firstIds = new Set(section.rows.map((row) => row.id));
  const rows = [...section.rows, ...more.rows.filter((row) => !firstIds.has(row.id))];
  const total = more.total;
  const loadedIds = rows.map((row) => row.id);
  const loadedSelected = loadedIds.length > 0 && loadedIds.every((id) => selected.has(id));
  const selectedCount = allMatching ? total : selected.size;

  function loadMore() {
    if (more.loading) return;
    const page = more.pages + 1;
    setMore((current) => ({ ...current, loading: true, error: undefined }));
    void (async () => {
      try {
        const result = await loadOpportunityColumnAction({ ...section.query, page });
        if (!result.ok) {
          setMore((current) => ({ ...current, loading: false, error: result.message }));
          return;
        }
        setMore((current) => {
          const seen = new Set(current.rows.map((row) => row.id));
          return {
            rows: [...current.rows, ...result.value.items.filter((row) => !seen.has(row.id))],
            pages: page,
            total: result.value.total,
            loading: false,
            error: undefined,
          };
        });
      } catch {
        // La excepción quedó logueada en el servidor.
        setMore((current) => ({ ...current, loading: false, error: UNEXPECTED_ERROR_MESSAGE }));
      }
    })();
  }

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

  const leading =
    bulk === undefined ? undefined : collapsed || rows.length === 0 ? (
      <SelectionSpacer />
    ) : (
      <Checkbox
        checked={loadedSelected}
        aria-label="Seleccionar las cargadas"
        title="Seleccionar las cargadas"
        onCheckedChange={(checked) => {
          setAllMatching(false);
          setSelected(checked === true ? new Set(loadedIds) : new Set());
        }}
      />
    );

  return (
    <>
      <StageHeader
        stage={stage}
        count={count}
        expanded={!collapsed}
        loading={pending}
        leading={leading}
        onToggle={() => {
          setCollapsed((current) => !current);
        }}
      />
      {!collapsed && (
        <div className={cn('border-t border-border', pending && 'opacity-60')}>
          {bulk !== undefined && selectedCount > 0 && (
            <div
              role="region"
              aria-label="Selección"
              className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-muted/50 px-4 py-2 text-sm"
            >
              <span className="font-medium tabular-nums">
                {selectedCount.toLocaleString('es-AR')}{' '}
                {selectedCount === 1 ? 'seleccionada' : 'seleccionadas'}
              </span>
              {loadedSelected && !allMatching && total > loadedIds.length && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => {
                    setAllMatching(true);
                  }}
                >
                  Seleccionar las {total.toLocaleString('es-AR')} de este estado
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
          {rows.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              No hay oportunidades en este estado.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((row) => (
                <OpportunityLine
                  key={row.id}
                  row={row}
                  catalog={catalog}
                  canPickAgents={canPickAgents}
                  onDialog={(target, kind) => {
                    setRowDialog({ row: target, kind });
                  }}
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
          {(total > rows.length || more.error !== undefined) && (
            <div className="flex flex-col items-center gap-1 border-t border-border px-4 py-3">
              {more.error !== undefined && (
                <p role="alert" className="text-sm text-destructive">
                  {more.error}
                </p>
              )}
              {total > rows.length && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={more.loading}
                  onClick={loadMore}
                >
                  {more.loading && <Loader2Icon className="h-4 w-4 animate-spin" />}
                  Ver más
                </Button>
              )}
              <p className="text-xs text-muted-foreground tabular-nums">
                {rows.length.toLocaleString('es-AR')} de {total.toLocaleString('es-AR')}
              </p>
            </div>
          )}
        </div>
      )}
      {rowDialog?.kind === 'note' && (
        <OpportunityNoteDialog
          target={opportunityTarget(rowDialog.row)}
          open
          onOpenChange={(open) => {
            if (!open) setRowDialog(undefined);
          }}
        />
      )}
      {rowDialog?.kind === 'history' && (
        <OpportunityHistoryDialog
          target={opportunityTarget(rowDialog.row)}
          open
          onOpenChange={(open) => {
            if (!open) setRowDialog(undefined);
          }}
        />
      )}
      {bulk !== undefined && dialogOpen && (
        <OpportunityBulkDialog
          selection={
            allMatching
              ? { kind: 'filter', filter: { ...bulk.filter, stageId: section.stageId } }
              : { kind: 'ids', ids: [...selected] }
          }
          count={selectedCount}
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
    </>
  );
}

function countsByStage(counts: readonly OpportunityStageCount[]): ReadonlyMap<string, number> {
  return new Map(counts.map((item) => [item.stageId, item.count]));
}

/** Los estados activos siempre; los desactivados, solo si todavía tienen oportunidades. */
function shownStages(
  stages: readonly OpportunityStageRow[],
  countOf: ReadonlyMap<string, number>,
): readonly OpportunityStageRow[] {
  return stages.filter((stage) => stage.isActive || (countOf.get(stage.id) ?? 0) > 0);
}

function PipelineBody({
  stages,
  counts,
  section,
  focusedStageId,
  catalog,
  canPickAgents,
  bulk,
  toolbar,
}: {
  readonly stages: readonly OpportunityStageRow[];
  readonly counts: readonly OpportunityStageCount[];
  readonly section: OpportunitySection | undefined;
  readonly focusedStageId: string | undefined;
  readonly catalog: OpportunityCatalogView;
  readonly canPickAgents: boolean;
  readonly bulk: OpportunityBulkContext | undefined;
  readonly toolbar: ReactNode;
}) {
  const { setParams, pending } = useListNavigation();
  const countOf = countsByStage(counts);
  const shown = shownStages(stages, countOf);
  const visible =
    focusedStageId === undefined ? shown : shown.filter((stage) => stage.id === focusedStageId);
  const total = counts.reduce((sum, item) => sum + item.count, 0);

  function open(stageId: string) {
    // Otra sección arranca abierta, en su página 1 y con el mismo orden.
    setParams({ stageId });
  }

  return (
    <div className="flex flex-col">
      <PipelineToolbar view="list">{toolbar}</PipelineToolbar>
      {total === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          No hay oportunidades con estos filtros.
        </p>
      ) : (
        <ul aria-busy={pending} className="divide-y divide-border">
          {visible.map((stage) => {
            const count = countOf.get(stage.id) ?? 0;
            return (
              <li key={stage.id}>
                {section?.stageId === stage.id ? (
                  <ExpandedStage
                    // Otro orden, otros filtros o la primera página cambió (después de una acción):
                    // arranca de nuevo, sin "Ver más" ni selección.
                    key={`${JSON.stringify(section.query)}:${section.rows.map((row) => row.id).join(',')}`}
                    stage={stage}
                    count={count}
                    section={section}
                    catalog={catalog}
                    canPickAgents={canPickAgents}
                    bulk={bulk}
                  />
                ) : (
                  <StageHeader
                    stage={stage}
                    count={count}
                    expanded={false}
                    loading={false}
                    leading={bulk === undefined ? undefined : <SelectionSpacer />}
                    onToggle={() => {
                      open(stage.id);
                    }}
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
 * El pipeline en lista: un acordeón con una sección por estado (o solo el elegido en las tarjetas). Solo la sección abierta trae sus oportunidades, paginadas en el servidor.
 */
export function OpportunityPipeline(props: {
  readonly stages: readonly OpportunityStageRow[];
  readonly counts: readonly OpportunityStageCount[];
  readonly section: OpportunitySection | undefined;
  /** El estado elegido en `OpportunityStageCards`: la lista muestra solo esa sección. */
  readonly focusedStageId: string | undefined;
  readonly catalog: OpportunityCatalogView;
  readonly canPickAgents: boolean;
  /** Sin permiso para ninguna acción masiva, no hay selección. */
  readonly bulk: OpportunityBulkContext | undefined;
  readonly toolbar: ReactNode;
}) {
  return (
    <ListNavigationProvider>
      <PipelineBody {...props} />
    </ListNavigationProvider>
  );
}

/** Una tarjeta por estado con su total: tocarla filtra la lista a ese estado; otra vez, lo quita. */
function StageCardsBody({
  stages,
  counts,
  focusedStageId,
}: {
  readonly stages: readonly OpportunityStageRow[];
  readonly counts: readonly OpportunityStageCount[];
  readonly focusedStageId: string | undefined;
}) {
  const { setParams } = useListNavigation();
  const countOf = countsByStage(counts);

  function select(stageId: string) {
    // Al quitar el filtro, el estado que se estaba viendo queda abierto.
    setParams(
      stageId === focusedStageId
        ? { estado: undefined, stageId }
        : { estado: stageId, stageId: undefined },
    );
  }

  return (
    <nav aria-label="Oportunidades por estado">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
        {shownStages(stages, countOf).map((stage) => {
          const count = countOf.get(stage.id) ?? 0;
          const active = focusedStageId === stage.id;
          return (
            <li key={stage.id}>
              <button
                type="button"
                aria-pressed={active}
                title={
                  active
                    ? 'Mostrar todos los estados'
                    : `Ver solo ${stage.name} (${OPPORTUNITY_STATUS_LABELS[stage.category]})`
                }
                className={cn(
                  'flex h-full w-full flex-col gap-1.5 rounded-lg border border-border bg-card px-3 shadow-xs py-2.5 text-left transition-colors outline-none hover:border-foreground/30 focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  count === 0 && !active && 'text-muted-foreground',
                )}
                style={{
                  // El tinte va sobre el fondo de la tarjeta: sueltas, quedan sobre el de la página.
                  backgroundImage: `linear-gradient(${stageTint(stage.color, active ? 18 : 6)}, ${stageTint(stage.color, active ? 18 : 6)})`,
                  ...(active ? { borderColor: stage.color } : {}),
                }}
                onClick={() => {
                  select(stage.id);
                }}
              >
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <ColorDot color={stage.color} className="h-2.5 w-2.5" />
                  <span className="truncate">{stage.name}</span>
                </span>
                <span className="text-2xl leading-none font-semibold tabular-nums">
                  {count.toLocaleString('es-AR')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Las tarjetas por estado, sueltas arriba de la lista: su total con los filtros aplicados. Tocar una
 * filtra la lista a ese estado (`?estado=`); tocarla otra vez lo quita.
 */
export function OpportunityStageCards(props: {
  readonly stages: readonly OpportunityStageRow[];
  readonly counts: readonly OpportunityStageCount[];
  readonly focusedStageId: string | undefined;
}) {
  return (
    <ListNavigationProvider>
      <StageCardsBody {...props} />
    </ListNavigationProvider>
  );
}
