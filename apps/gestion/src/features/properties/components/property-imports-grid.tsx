'use client';

import type { PropertyImportRow } from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { UploadIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';

import { formatDateTime } from '../../../lib/format';
import type { PanelData } from '../../../lib/panel-params';
import { usePanel } from '../../shared/components/entity-sheet';
import { ServerDataTable } from '../../shared/components/server-data-table';
import type { PropertyImportSheetData } from '../import-panel';
import {
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
 * El historial de importaciones de propiedades de Tokko, paginado en el servidor. Mientras alguna
 * está en proceso, la página se refresca sola para mostrar el avance.
 */
export function PropertyImportsGrid({
  rows,
  total,
  page,
  pageSize,
  sort,
  detail,
}: {
  readonly rows: readonly PropertyImportRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
  /** La importación del panel, si está abierto. */
  readonly detail: PanelData<PropertyImportSheetData> | undefined;
}) {
  const router = useRouter();
  const navigation = usePanel();
  const { openEdit, openNew } = navigation;
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
        id: 'fileName',
        header: 'Archivo',
        className: 'max-w-[260px] whitespace-normal break-words font-medium',
        cell: (row) => row.fileName,
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
          <Button type="button" className="w-full sm:ml-auto sm:w-auto" onClick={openNew}>
            <UploadIcon className="h-4 w-4" />
            Importar de Tokko
          </Button>
        }
        empty="Todavía no se importaron propiedades."
      />
      <PropertyImportSheet navigation={navigation} detail={detail} />
    </>
  );
}
