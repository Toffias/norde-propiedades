'use client';

import {
  QUICK_REPLY_STATUS_VALUES,
  type QuickReplyRow,
  type QuickReplyStatusValue,
} from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { Input } from '@norde/ui/components/input';
import { RowAction, RowActions } from '@norde/ui/components/row-actions';
import { cn } from '@norde/ui/lib/utils';
import { PauseIcon, PencilIcon, PlayIcon, PlusIcon, SearchIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { ActionResult } from '../../../lib/action-result';
import { formatDateTime } from '../../../lib/format';
import type { PanelData } from '../../../lib/panel-params';
import {
  ConfirmActionDialog,
  type ConfirmActionCopy,
} from '../../shared/components/confirm-action-dialog';
import { usePanel } from '../../shared/components/entity-sheet';
import { ServerDataTable, useListNavigation } from '../../shared/components/server-data-table';
import { deleteQuickReplyAction, setQuickReplyActiveAction } from '../actions';
import { QuickReplySheet } from './quick-reply-sheet';

const STATUS_LABELS: Readonly<Record<QuickReplyStatusValue, string>> = {
  active: 'Activas',
  inactive: 'Inactivas',
};

interface PendingAction {
  readonly copy: ConfirmActionCopy;
  readonly run: () => Promise<ActionResult>;
}

function getRowId(reply: QuickReplyRow): string {
  return reply.id;
}

/** Búsqueda por nombre (con debounce) y las pestañas Activas / Inactivas. */
function QuickRepliesToolbar({
  text,
  status,
}: {
  readonly text: string;
  readonly status: QuickReplyStatusValue;
}) {
  const { setParams } = useListNavigation();
  const [search, setSearch] = useState(text);

  useEffect(() => {
    if (search.trim() === text) return;
    const timer = setTimeout(() => {
      setParams({ q: search.trim() });
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [search, text, setParams]);

  return (
    <>
      <div className="relative w-full sm:max-w-[280px]">
        <SearchIcon className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Buscar por nombre"
          aria-label="Buscar por nombre"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      </div>
      <div role="group" aria-label="Estado de las respuestas" className="flex flex-wrap gap-2">
        {QUICK_REPLY_STATUS_VALUES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={status === value}
            className={cn(
              'inline-flex items-center rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium whitespace-nowrap text-secondary-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
              status === value &&
                'border-transparent bg-foreground text-background hover:bg-foreground',
            )}
            onClick={() => {
              setParams({ status: value === 'active' ? undefined : value });
            }}
          >
            {STATUS_LABELS[value]}
          </button>
        ))}
      </div>
    </>
  );
}

/** Las respuestas rápidas en una grilla paginada, con su panel de alta y edición. */
export function QuickRepliesGrid({
  rows,
  total,
  page,
  pageSize,
  sort,
  status,
  text,
  detail,
}: {
  readonly rows: readonly QuickReplyRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
  readonly status: QuickReplyStatusValue;
  readonly text: string;
  /** La respuesta del panel de edición, si está abierto. */
  readonly detail: PanelData<QuickReplyRow> | undefined;
}) {
  const navigation = usePanel();
  const { openEdit, openNew } = navigation;
  const [pending, setPending] = useState<PendingAction | undefined>();

  const columns = useMemo(
    (): readonly DataTableColumn<QuickReplyRow>[] => [
      {
        id: 'name',
        header: 'Nombre',
        sortable: true,
        className: 'font-medium',
        cell: (reply) => reply.name,
      },
      {
        id: 'subject',
        header: 'Asunto',
        showFrom: 'md',
        className: 'text-muted-foreground',
        cell: (reply) => (
          <span className="block max-w-[220px] truncate" title={reply.subject}>
            {reply.subject ?? ''}
          </span>
        ),
      },
      {
        id: 'body',
        header: 'Mensaje',
        showFrom: 'lg',
        className: 'text-muted-foreground',
        cell: (reply) => (
          <span className="block max-w-[320px] truncate" title={reply.body}>
            {reply.body}
          </span>
        ),
      },
      {
        id: 'updatedAt',
        header: 'Modificada',
        showFrom: 'md',
        className: 'w-[170px] text-muted-foreground tabular-nums',
        cell: (reply) => formatDateTime(reply.updatedAt),
      },
      {
        id: 'actions',
        header: 'Acciones',
        hideHeader: true,
        className: 'w-[130px] text-right',
        cell: (reply) => (
          <RowActions>
            <RowAction
              icon={PencilIcon}
              label="Editar"
              onClick={() => {
                openEdit(reply.id);
              }}
            />
            {reply.isActive ? (
              <RowAction
                icon={PauseIcon}
                label="Desactivar"
                onClick={() => {
                  setPending({
                    copy: {
                      title: 'Desactivar respuesta rápida',
                      description: `${reply.name} deja de ofrecerse al enviar. La podés volver a activar.`,
                      confirm: 'Desactivar',
                      done: 'Respuesta rápida desactivada',
                    },
                    run: () => setQuickReplyActiveAction({ quickReplyId: reply.id, active: false }),
                  });
                }}
              />
            ) : (
              <RowAction
                icon={PlayIcon}
                label="Activar"
                onClick={() => {
                  setPending({
                    copy: {
                      title: 'Activar respuesta rápida',
                      description: `${reply.name} vuelve a ofrecerse al enviar.`,
                      confirm: 'Activar',
                      done: 'Respuesta rápida activada',
                    },
                    run: () => setQuickReplyActiveAction({ quickReplyId: reply.id, active: true }),
                  });
                }}
              />
            )}
            <RowAction
              icon={Trash2Icon}
              label="Borrar"
              destructive
              onClick={() => {
                setPending({
                  copy: {
                    title: 'Borrar respuesta rápida',
                    description: `${reply.name} se borra. Los envíos que ya la usaron no cambian.`,
                    confirm: 'Borrar',
                    done: 'Respuesta rápida borrada',
                    destructive: true,
                  },
                  run: () => deleteQuickReplyAction({ quickReplyId: reply.id }),
                });
              }}
            />
          </RowActions>
        ),
      },
    ],
    [openEdit],
  );

  return (
    <>
      <ServerDataTable
        label="Respuestas rápidas"
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        getRowId={getRowId}
        toolbar={
          <>
            <QuickRepliesToolbar text={text} status={status} />
            {status === 'active' && (
              <Button type="button" className="sm:ml-auto" onClick={openNew}>
                <PlusIcon className="h-4 w-4" />
                Nueva respuesta
              </Button>
            )}
          </>
        }
        empty={
          text !== ''
            ? 'No hay respuestas rápidas que coincidan con la búsqueda.'
            : status === 'inactive'
              ? 'No hay respuestas rápidas inactivas.'
              : 'Todavía no hay respuestas rápidas. Cargá la primera para usarla al enviar propiedades.'
        }
      />
      <QuickReplySheet navigation={navigation} detail={detail} />
      <ConfirmActionDialog
        copy={pending?.copy}
        run={pending?.run ?? (() => Promise.resolve({ ok: true }))}
        onOpenChange={(open) => {
          if (!open) setPending(undefined);
        }}
      />
    </>
  );
}
