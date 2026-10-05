'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  OPPORTUNITY_STATUS_LABELS,
  OPPORTUNITY_TYPE_LABELS,
  type ListOpportunitiesQuery,
  type OpportunityPipelineRow,
  type OpportunityStageRow,
} from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import { toast } from '@norde/ui/components/sonner';
import { SoftBadge } from '@norde/ui/components/status-pill';
import { cn } from '@norde/ui/lib/utils';
import { GripVerticalIcon, Loader2Icon, LockIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from 'react';

import { runAction } from '../../../lib/action-result';
import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { formatDate, formatDateTime } from '../../../lib/format';
import { clientName } from '../../clients/client-format';
import { ListNavigationProvider } from '../../shared/components/server-data-table';
import { changeOpportunityStageAction, loadOpportunityColumnAction } from '../pipeline-actions';

import { ColorDot, stageTint } from './catalog-pieces';
import {
  CloseDialog,
  OpportunityActionsMenu,
  type OpportunityCatalogView,
} from './opportunity-actions';
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

/** Una columna tal como la trae el servidor: su estado, cuántas tiene y su primera página. */
export interface OpportunityBoardColumn {
  readonly stage: OpportunityStageRow;
  readonly total: number;
  readonly rows: readonly OpportunityPipelineRow[];
  /** No se pudo traer la primera página. */
  readonly error: string | undefined;
}

/** Los filtros y el orden de la URL: cada columna pide sus páginas siguientes con los mismos. */
export type OpportunityBoardQuery = Omit<ListOpportunitiesQuery, 'stageId' | 'page'> & {
  readonly pageSize: number;
  readonly sort: OpportunitySort;
};

interface ColumnState {
  readonly rows: readonly OpportunityPipelineRow[];
  readonly total: number;
  /** Páginas ya traídas (la primera vino con la página). */
  readonly pages: number;
  readonly loading: boolean;
  readonly error: string | undefined;
}

type Columns = Readonly<Record<string, ColumnState>>;

function fromServer(columns: readonly OpportunityBoardColumn[]): Columns {
  return Object.fromEntries(
    columns.map((column) => [
      column.stage.id,
      {
        rows: column.rows,
        total: column.total,
        pages: 1,
        loading: false,
        error: column.error,
      },
    ]),
  );
}

/** Las categorías a las que solo se llega cerrando (con un motivo). */
function isClosing(stage: OpportunityStageRow): boolean {
  return stage.category === 'won' || stage.category === 'lost';
}

/** A qué columnas puede ir la tarjeta, según lo que dijo el caso de uso (`can`). */
function reachable(
  row: OpportunityPipelineRow,
  stage: OpportunityStageRow,
  catalog: OpportunityCatalogView,
): boolean {
  if (!isClosing(stage)) return row.can.moveTo.includes(stage.id);
  return catalog.closeReasons.some(
    (reason) => reason.closesAs === stage.category && row.can.closeWith.includes(reason.id),
  );
}

/** La columna bajo el puntero; con el teclado (sin puntero), la que más se superpone. */
const columnUnderPointer: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : rectIntersection(args);
};

function countLabel(count: number): string {
  return `${count.toLocaleString('es-AR')} ${count === 1 ? 'oportunidad' : 'oportunidades'}`;
}

function CardBody({
  row,
  handle,
  footer,
}: {
  readonly row: OpportunityPipelineRow;
  readonly handle: ReactNode;
  readonly footer: ReactNode;
}) {
  const name = clientName(row.client.name);
  return (
    <>
      <div className="flex items-start gap-2">
        <ContactInitials name={name} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link
            href={contactHref(row.client.id)}
            className="truncate text-sm font-medium hover:underline"
          >
            {name}
          </Link>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <SoftBadge>{OPPORTUNITY_TYPE_LABELS[row.type] ?? row.type}</SoftBadge>
            {row.client.contactMasked && (
              <LockIcon
                className="h-3 w-3 text-muted-foreground"
                aria-label="Datos de propietario"
              />
            )}
          </div>
        </div>
        {handle}
      </div>
      {row.property !== undefined && <PropertyLink property={row.property} />}
      {row.lastNote !== undefined && (
        <p className="line-clamp-2 text-xs text-muted-foreground italic">“{row.lastNote}”</p>
      )}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums">
        <span title={`En este estado desde el ${formatDateTime(row.statusChangedAt)}`}>
          {daysLabel(row.daysInStage)} en el estado
        </span>
        <span title={`Actualizada el ${formatDateTime(row.updatedAt)}`}>
          Act. {formatDate(row.updatedAt)}
        </span>
      </div>
      {footer}
    </>
  );
}

function BoardCard({
  row,
  catalog,
  canPickAgents,
  onDialog,
}: {
  readonly row: OpportunityPipelineRow;
  readonly catalog: OpportunityCatalogView;
  readonly canPickAgents: boolean;
  readonly onDialog: (row: OpportunityPipelineRow, dialog: OpportunityDialog) => void;
}) {
  const name = clientName(row.client.name);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: row.id,
    disabled: !row.can.update,
  });

  return (
    <article
      ref={setNodeRef}
      aria-label={`Oportunidad de ${name}`}
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-xs',
        isDragging && 'opacity-40',
      )}
    >
      <CardBody
        row={row}
        handle={
          row.can.update && (
            <button
              type="button"
              aria-label={`Mover la oportunidad de ${name}`}
              title="Arrastrá para cambiar el estado"
              className="-mt-1 -mr-1 inline-flex h-7 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing"
              {...attributes}
              {...listeners}
            >
              <GripVerticalIcon className="h-4 w-4" />
            </button>
          )
        }
        footer={
          <div className="-mx-1 -mb-1 flex items-center justify-between border-t border-border pt-1">
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
        }
      />
    </article>
  );
}

function BoardColumn({
  stage,
  state,
  dragging,
  catalog,
  canPickAgents,
  onLoadMore,
  onDialog,
}: {
  readonly stage: OpportunityStageRow;
  readonly state: ColumnState;
  /** La tarjeta que se está arrastrando, para marcar a dónde puede ir. */
  readonly dragging: { readonly row: OpportunityPipelineRow; readonly from: string } | undefined;
  readonly catalog: OpportunityCatalogView;
  readonly canPickAgents: boolean;
  readonly onLoadMore: (stageId: string) => void;
  readonly onDialog: (row: OpportunityPipelineRow, dialog: OpportunityDialog) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = state.rows.length < state.total && state.error === undefined;
  const target = dragging !== undefined && dragging.from !== stage.id;
  const allowed = target && reachable(dragging.row, stage, catalog);

  // Al llegar al final del scroll de la columna, pide la página siguiente.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || state.loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore(stage.id);
      },
      { root: scroller.current, rootMargin: '120px' },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [hasMore, state.loading, onLoadMore, stage.id]);

  return (
    <section
      ref={setNodeRef}
      aria-label={`${stage.name}: ${countLabel(state.total)}`}
      className={cn(
        'flex max-h-[calc(100dvh-16rem)] min-h-48 w-[85vw] max-w-[300px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-border transition-[opacity,box-shadow] sm:w-[280px]',
        target && !allowed && 'opacity-50',
        isOver && allowed && 'ring-2 ring-primary',
        isOver && !allowed && 'ring-2 ring-destructive/60',
      )}
      style={{ backgroundColor: stageTint(stage.color, 5) }}
    >
      <header
        className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5"
        style={{ backgroundColor: stageTint(stage.color, 10) }}
      >
        <span className="flex min-w-0 items-center gap-2">
          <ColorDot color={stage.color} />
          <span className="truncate text-sm font-semibold">{stage.name}</span>
        </span>
        <span
          className="text-xs text-muted-foreground tabular-nums"
          title={`${OPPORTUNITY_STATUS_LABELS[stage.category]}${stage.isActive ? '' : ' · desactivado'}`}
        >
          {state.total.toLocaleString('es-AR')}
        </span>
      </header>
      <div ref={scroller} className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
        {state.rows.map((row) => (
          <BoardCard
            key={row.id}
            row={row}
            catalog={catalog}
            canPickAgents={canPickAgents}
            onDialog={onDialog}
          />
        ))}
        {state.rows.length === 0 && state.error === undefined && (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground">Sin oportunidades.</p>
        )}
        {state.error !== undefined && (
          <div className="flex flex-col items-center gap-2 px-1 py-3 text-center text-xs text-destructive">
            <p>{state.error}</p>
            {state.rows.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onLoadMore(stage.id);
                }}
              >
                Reintentar
              </Button>
            )}
          </div>
        )}
        {hasMore && (
          <div ref={sentinel} className="flex justify-center py-2">
            {state.loading ? (
              <Loader2Icon
                className="h-4 w-4 animate-spin text-muted-foreground"
                aria-label="Cargando"
              />
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onLoadMore(stage.id);
                }}
              >
                Ver más
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function BoardBody({
  columns: serverColumns,
  query,
  catalog,
  canPickAgents,
  toolbar,
}: {
  readonly columns: readonly OpportunityBoardColumn[];
  readonly query: OpportunityBoardQuery;
  readonly catalog: OpportunityCatalogView;
  readonly canPickAgents: boolean;
  readonly toolbar: ReactNode;
}) {
  // Lo que trajo el servidor manda: cuando revalida (después de mover o cerrar), las columnas
  // vuelven a su primera página.
  const [source, setSource] = useState(serverColumns);
  const [columns, setColumns] = useState<Columns>(() => fromServer(serverColumns));
  if (source !== serverColumns) {
    setSource(serverColumns);
    setColumns(fromServer(serverColumns));
  }
  const [dragging, setDragging] = useState<
    { readonly row: OpportunityPipelineRow; readonly from: string } | undefined
  >();
  const [closing, setClosing] = useState<
    { readonly row: OpportunityPipelineRow; readonly stage: OpportunityStageRow } | undefined
  >();
  const [dialog, setDialog] = useState<
    { readonly row: OpportunityPipelineRow; readonly kind: OpportunityDialog } | undefined
  >();
  const [, startTransition] = useTransition();
  const loading = useRef(new Set<string>());
  // Los IDs de accesibilidad de dnd-kit tienen que ser los mismos en el servidor y en el cliente.
  const dndId = useId();

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function update(stageId: string, change: (state: ColumnState) => ColumnState) {
    setColumns((current) => {
      const state = current[stageId];
      return state === undefined ? current : { ...current, [stageId]: change(state) };
    });
  }

  function loadMore(stageId: string) {
    const state = columns[stageId];
    if (state === undefined || loading.current.has(stageId)) return;
    loading.current.add(stageId);
    const page = state.pages + 1;
    update(stageId, (s) => ({ ...s, loading: true, error: undefined }));
    void (async () => {
      try {
        const result = await loadOpportunityColumnAction({ ...query, stageId, page });
        if (!result.ok) {
          update(stageId, (s) => ({ ...s, loading: false, error: result.message }));
          return;
        }
        // Si algo se movió mientras tanto, la página puede repetir tarjetas: se agregan una vez.
        update(stageId, (s) => {
          const seen = new Set(s.rows.map((row) => row.id));
          return {
            rows: [...s.rows, ...result.value.items.filter((row) => !seen.has(row.id))],
            total: result.value.total,
            pages: page,
            loading: false,
            error: undefined,
          };
        });
      } catch {
        // La excepción quedó logueada en el servidor.
        update(stageId, (s) => ({ ...s, loading: false, error: UNEXPECTED_ERROR_MESSAGE }));
      } finally {
        loading.current.delete(stageId);
      }
    })();
  }

  function findRow(id: string): { row: OpportunityPipelineRow; from: string } | undefined {
    for (const [stageId, state] of Object.entries(columns)) {
      const row = state.rows.find((r) => r.id === id);
      if (row) return { row, from: stageId };
    }
    return undefined;
  }

  function onDragStart(event: DragStartEvent) {
    setDragging(findRow(String(event.active.id)));
  }

  function onDragEnd(event: DragEndEvent) {
    const current = dragging;
    setDragging(undefined);
    const overId = event.over === null ? undefined : String(event.over.id);
    if (current === undefined || overId === undefined || overId === current.from) return;
    const stage = catalog.stages.find((s) => s.id === overId);
    if (!stage) return;
    const { row, from } = current;

    // A ganada o perdida se llega cerrando: el diálogo pide el motivo.
    if (isClosing(stage)) {
      if (reachable(row, stage, catalog)) setClosing({ row, stage });
      else toast.error(`Esta oportunidad no puede pasar a "${stage.name}".`);
      return;
    }

    // Se mueve en pantalla y se confirma en el servidor; si lo rechaza, vuelve a su lugar.
    const before = columns;
    const moved = { ...row, stageId: stage.id, status: stage.category, daysInStage: 0 };
    setColumns((cols) => {
      const source = cols[from];
      const target = cols[stage.id];
      if (!source || !target) return cols;
      return {
        ...cols,
        [from]: {
          ...source,
          rows: source.rows.filter((r) => r.id !== row.id),
          total: source.total - 1,
        },
        [stage.id]: { ...target, rows: [moved, ...target.rows], total: target.total + 1 },
      };
    });
    startTransition(async () => {
      const message = await runAction(() =>
        changeOpportunityStageAction({ opportunityId: row.id, stageId: stage.id }),
      );
      if (message !== undefined) {
        setColumns(before);
        toast.error(message);
      } else {
        toast.success(`Pasó a "${stage.name}"`);
      }
    });
  }

  const totalShown = Object.values(columns).reduce((sum, state) => sum + state.total, 0);

  return (
    <div className="flex flex-col">
      <PipelineToolbar view="board">{toolbar}</PipelineToolbar>
      <p className="border-b border-border px-4 py-2 text-sm text-muted-foreground tabular-nums">
        {countLabel(totalShown)}
      </p>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={columnUnderPointer}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setDragging(undefined);
        }}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              'Para mover la oportunidad, apretá espacio o enter, elegí el estado con las flechas y confirmá con espacio o enter. Escape cancela.',
          },
        }}
      >
        <div className="flex snap-x gap-3 overflow-x-auto p-3">
          {serverColumns.map(({ stage }) => {
            const state = columns[stage.id];
            if (!state) return null;
            return (
              <BoardColumn
                key={stage.id}
                stage={stage}
                state={state}
                dragging={dragging}
                catalog={catalog}
                canPickAgents={canPickAgents}
                onLoadMore={loadMore}
                onDialog={(r, kind) => {
                  setDialog({ row: r, kind });
                }}
              />
            );
          })}
        </div>
        <DragOverlay dropAnimation={null}>
          {dragging && (
            <div className="flex w-[260px] rotate-2 flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-lg">
              <CardBody row={dragging.row} handle={null} footer={null} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {closing && (
        <CloseDialog
          target={{
            id: closing.row.id,
            clientName: clientName(closing.row.client.name),
            agent: closing.row.agent,
            can: closing.row.can,
          }}
          catalog={catalog}
          stage={closing.stage}
          open
          onOpenChange={(open) => {
            if (!open) setClosing(undefined);
          }}
        />
      )}
      {dialog?.kind === 'note' && (
        <OpportunityNoteDialog
          target={opportunityTarget(dialog.row)}
          open
          onOpenChange={(open) => {
            if (!open) setDialog(undefined);
          }}
        />
      )}
      {dialog?.kind === 'history' && (
        <OpportunityHistoryDialog
          target={opportunityTarget(dialog.row)}
          open
          onOpenChange={(open) => {
            if (!open) setDialog(undefined);
          }}
        />
      )}
    </div>
  );
}

/**
 * El pipeline en tablero: una columna por estado, con su contador. Cada columna trae su primera
 * página y pide las siguientes al llegar al final de su scroll. Arrastrar una tarjeta a otra columna
 * cambia el estado (lo valida el dominio: si lo rechaza, la tarjeta vuelve); a ganada o perdida se
 * llega cerrando con un motivo.
 */
export function OpportunityBoard(props: {
  readonly columns: readonly OpportunityBoardColumn[];
  readonly query: OpportunityBoardQuery;
  readonly catalog: OpportunityCatalogView;
  readonly canPickAgents: boolean;
  readonly toolbar: ReactNode;
}) {
  return (
    <ListNavigationProvider>
      <BoardBody {...props} />
    </ListNavigationProvider>
  );
}
