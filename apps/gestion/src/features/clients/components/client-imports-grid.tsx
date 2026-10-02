'use client';

import type { ClientImportRow } from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { UploadIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';

import { formatDateTime } from '../../../lib/format';
import type { PanelData } from '../../../lib/panel-params';
import { usePanel } from '../../shared/components/entity-sheet';
import { ServerDataTable } from '../../shared/components/server-data-table';
import { userName } from '../client-format';
import type { ClientImportSheetData } from '../import-panel';
import { ClientImportSheet } from './client-import-sheet';
import { isImportRunning, ImportStatusPill } from './client-import-status';

/** Cada cuánto se refresca mientras hay una importación en proceso. */
const REFRESH_MS = 3000;

function getRowId(row: ClientImportRow): string {
  return row.id;
}

const count = (value: number) => value.toLocaleString('es-AR');

/**
 * El historial de importaciones de contactos, paginado en el servidor. Mientras alguna está en
 * proceso, la página se refresca sola para mostrar el avance.
 */
export function ClientImportsGrid({
  rows,
  total,
  page,
  pageSize,
  sort,
  detail,
  canPickAgents,
}: {
  readonly rows: readonly ClientImportRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
  /** La importación del panel, si está abierto. */
  readonly detail: PanelData<ClientImportSheetData> | undefined;
  /** Elegir el agente de los contactos importados (`clients:reassign` y `users:read`). */
  readonly canPickAgents: boolean;
}) {
  const router = useRouter();
  const navigation = usePanel();
  const { openEdit, openNew } = navigation;
  const running =
    rows.some((row) => isImportRunning(row.status)) ||
    (detail?.ok === true && isImportRunning(detail.value.job.status));

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
    (): readonly DataTableColumn<ClientImportRow>[] => [
      {
        id: 'createdAt',
        header: 'Fecha',
        sortable: true,
        className: 'w-[170px] tabular-nums',
        cell: (row) => formatDateTime(row.createdAt),
      },
      {
        id: 'fileName',
        header: 'Archivo',
        className: 'max-w-[260px] whitespace-normal break-words font-medium',
        cell: (row) => row.fileName,
      },
      {
        id: 'status',
        header: 'Estado',
        className: 'w-[120px]',
        cell: (row) => <ImportStatusPill status={row.status} />,
      },
      {
        id: 'created',
        header: 'Creados',
        className: 'w-[90px] text-right tabular-nums',
        cell: (row) => count(row.totals.created),
      },
      {
        id: 'duplicates',
        header: 'Duplicados',
        showFrom: 'md',
        className: 'w-[100px] text-right tabular-nums',
        cell: (row) => count(row.totals.duplicates),
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
        cell: (row) => userName(row.requestedBy),
      },
    ],
    [],
  );

  return (
    <>
      <ServerDataTable
        label="Importaciones de contactos"
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
          <Button type="button" className="w-full sm:ml-auto sm:w-auto" onClick={openNew}>
            <UploadIcon className="h-4 w-4" />
            Importar desde Excel
          </Button>
        }
        empty="Todavía no se importaron contactos."
      />
      <ClientImportSheet navigation={navigation} detail={detail} canPickAgents={canPickAgents} />
    </>
  );
}
