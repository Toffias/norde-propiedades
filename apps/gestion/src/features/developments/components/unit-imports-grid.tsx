'use client';

import type { DevelopmentUnitImportRow } from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { UploadIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';

import { EMPTY_VALUE, formatDateTime } from '../../../lib/format';
import type { PanelData } from '../../../lib/panel-params';
import { ImportStatusPill, isImportRunning } from '../../clients/components/client-import-status';
import { usePanel } from '../../shared/components/entity-sheet';
import { ServerDataTable } from '../../shared/components/server-data-table';
import type { UnitImportSheetData } from '../unit-import-panel';
import { ExportUnitsButton } from './export-units-button';
import { UnitImportSheet } from './unit-import-sheet';

/** Cada cuánto se refresca mientras hay una importación en proceso. */
const REFRESH_MS = 3000;

function getRowId(row: DevelopmentUnitImportRow): string {
  return row.id;
}

const count = (value: number) => value.toLocaleString('es-AR');

/**
 * Las importaciones de unidades del emprendimiento, paginadas en el servidor. Mientras alguna está
 * en proceso, la página se refresca sola para mostrar el avance.
 */
export function UnitImportsGrid({
  developmentId,
  rows,
  total,
  page,
  pageSize,
  sort,
  detail,
}: {
  readonly developmentId: string;
  readonly rows: readonly DevelopmentUnitImportRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
  /** La importación del panel, si está abierto. */
  readonly detail: PanelData<UnitImportSheetData> | undefined;
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
    (): readonly DataTableColumn<DevelopmentUnitImportRow>[] => [
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
        header: 'Creadas',
        className: 'w-[90px] text-right tabular-nums',
        cell: (row) => count(row.totals.created),
      },
      {
        id: 'updated',
        header: 'Actualizadas',
        showFrom: 'md',
        className: 'w-[110px] text-right tabular-nums',
        cell: (row) => count(row.totals.updated),
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
        cell: (row) => row.requestedBy?.name ?? EMPTY_VALUE,
      },
    ],
    [],
  );

  return (
    <>
      <ServerDataTable
        label="Importaciones de unidades"
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
          <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
            <ExportUnitsButton developmentId={developmentId} className="flex-1 sm:flex-none" />
            <Button type="button" className="flex-1 sm:flex-none" onClick={openNew}>
              <UploadIcon className="h-4 w-4" />
              Importar desde Excel
            </Button>
          </div>
        }
        empty="Todavía no se importaron unidades en este emprendimiento."
      />
      <UnitImportSheet developmentId={developmentId} navigation={navigation} detail={detail} />
    </>
  );
}
