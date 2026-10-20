'use client';

import type { PropertyImportRow } from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { toast } from '@norde/ui/components/sonner';
import { CloudDownloadIcon, Loader2Icon, UploadIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';

import { formatDateTime } from '../../../lib/format';
import type { PanelData } from '../../../lib/panel-params';
import { usePanel } from '../../shared/components/entity-sheet';
import { ServerDataTable } from '../../shared/components/server-data-table';
import { startTokkoApiPropertyImportAction } from '../import-actions';
import type { PropertyImportSheetData } from '../import-panel';
import {
  importOrigin,
  isPropertyImportRunning,
  PropertyImportSheet,
  PropertyImportStatusPill,
  requesterName,
} from './property-import-sheet';

/** Cada cuánto se refresca mientras hay una importación en proceso. */
const REFRESH_MS = 3000;

function getRowId(row: PropertyImportRow): string {
  return row.id;
}

const count = (value: number) => value.toLocaleString('es-AR');

/**
 * El historial de importaciones de propiedades de Tokko (de la exportación o de la API), paginado en
 * el servidor. Mientras alguna está en proceso, la página se refresca sola para mostrar el avance.
 */
export function PropertyImportsGrid({
  rows,
  total,
  page,
  pageSize,
  sort,
  detail,
  tokkoApi,
}: {
  readonly rows: readonly PropertyImportRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
  /** La importación del panel, si está abierto. */
  readonly detail: PanelData<PropertyImportSheetData> | undefined;
  /** Si hay una API key de Tokko: se pueden traer las propiedades con sus fotos. */
  readonly tokkoApi: boolean;
}) {
  const router = useRouter();
  const navigation = usePanel();
  const { openEdit, openNew } = navigation;
  const [starting, startTransition] = useTransition();
  const apiRunning = rows.some(
    (row) => row.source === 'api' && isPropertyImportRunning(row.status),
  );

  function startFromApi() {
    startTransition(async () => {
      let importId: string | undefined;
      const message = await runAction(async () => {
        const result = await startTokkoApiPropertyImportAction();
        importId = result.importId;
        return result;
      });
      if (message !== undefined || importId === undefined) {
        toast.error(message ?? UNEXPECTED_ERROR_MESSAGE);
        return;
      }
      toast.success('Se están trayendo las propiedades de Tokko');
      openEdit(importId);
    });
  }
  const running =
    rows.some((row) => isPropertyImportRunning(row.status)) ||
    (detail?.ok === true && isPropertyImportRunning(detail.value.job.status));

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      router.refresh();
    }, REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [router, running]);

  const columns = useMemo(
    (): readonly DataTableColumn<PropertyImportRow>[] => [
      {
        id: 'createdAt',
        header: 'Fecha',
        sortable: true,
        className: 'w-[170px] tabular-nums',
        cell: (row) => formatDateTime(row.createdAt),
      },
      {
        id: 'origin',
        header: 'Origen',
        className: 'max-w-[260px] whitespace-normal break-words font-medium',
        cell: (row) => importOrigin(row),
      },
      {
        id: 'status',
        header: 'Estado',
        className: 'w-[120px]',
        cell: (row) => <PropertyImportStatusPill status={row.status} />,
      },
      {
        id: 'created',
        header: 'Creadas',
        className: 'w-[90px] text-right tabular-nums',
        cell: (row) => count(row.totals.created),
      },
      {
        id: 'completed',
        header: 'Completadas',
        showFrom: 'md',
        className: 'w-[110px] text-right tabular-nums',
        cell: (row) => (row.source === 'api' ? count(row.totals.completed) : '—'),
      },
      {
        id: 'existing',
        header: 'Ya estaban',
        showFrom: 'md',
        className: 'w-[100px] text-right tabular-nums',
        cell: (row) => count(row.totals.existing),
      },
      {
        id: 'failed',
        header: 'Con errores',
        showFrom: 'md',
        className: 'w-[110px] text-right tabular-nums',
        cell: (row) => count(row.totals.failed),
      },
      {
        id: 'requestedBy',
        header: 'Importó',
        showFrom: 'lg',
        className: 'text-muted-foreground',
        cell: (row) => requesterName(row),
      },
    ],
    [],
  );

  return (
    <>
      <ServerDataTable
        label="Importaciones de propiedades"
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        getRowId={getRowId}
        onRowClick={(row) => {
          openEdit(row.id);
        }}
        toolbar={
          <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row">
            {tokkoApi && (
              <Button
                type="button"
                variant="outline"
                disabled={starting || apiRunning}
                onClick={startFromApi}
              >
                {starting ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <CloudDownloadIcon className="h-4 w-4" />
                )}
                Traer de la API de Tokko
              </Button>
            )}
            <Button type="button" onClick={openNew}>
              <UploadIcon className="h-4 w-4" />
              Importar de Tokko
            </Button>
          </div>
        }
        empty="Todavía no se importaron propiedades."
      />
      <PropertyImportSheet navigation={navigation} detail={detail} />
    </>
  );
}
