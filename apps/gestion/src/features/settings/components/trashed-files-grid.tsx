'use client';

import type { TrashedFileRow } from '@norde/core/settings/contracts';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { RowAction, RowActions } from '@norde/ui/components/row-actions';
import { toast } from '@norde/ui/components/sonner';
import { FileIcon, RotateCcwIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { runAction } from '../../../lib/action-result';
import { formatDate } from '../../../lib/format';
import { ServerDataTable } from '../../shared/components/server-data-table';
import { restoreCompanyFileAction } from '../actions';
import { formatBytes } from './company-files-grid';

export interface TrashedFilesGridProps {
  readonly rows: readonly TrashedFileRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
}

function getRowId(row: TrashedFileRow): string {
  return row.id;
}

export function TrashedFilesGrid(page: TrashedFilesGridProps) {
  const router = useRouter();

  async function restore(row: TrashedFileRow) {
    const message = await runAction(() => restoreCompanyFileAction({ fileId: row.id }));
    if (message !== undefined) {
      toast.error(message);
      return;
    }
    toast.success(`${row.name} restaurado`);
    router.refresh();
  }

  const columns: readonly DataTableColumn<TrashedFileRow>[] = [
    {
      id: 'name',
      header: 'Nombre',
      sortable: true,
      className: 'font-medium',
      cell: (row) => (
        <span className="inline-flex items-center gap-2">
          <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{row.name}</span>
        </span>
      ),
    },
    {
      id: 'size',
      header: 'Tamaño',
      showFrom: 'md',
      className: 'w-[110px] text-muted-foreground tabular-nums',
      cell: (row) => formatBytes(row.sizeBytes),
    },
    {
      id: 'deletedAt',
      header: 'Borrado',
      sortable: true,
      className: 'w-[130px] text-muted-foreground',
      cell: (row) => formatDate(row.deletedAt),
    },
    {
      id: 'actions',
      header: 'Acciones',
      hideHeader: true,
      className: 'w-[60px] text-right',
      cell: (row) => (
        <RowActions>
          <RowAction
            icon={RotateCcwIcon}
            label="Restaurar"
            onClick={() => {
              void restore(row);
            }}
          />
        </RowActions>
      ),
    },
  ];

  return (
    <ServerDataTable
      label="Papelera de archivos"
      columns={columns}
      getRowId={getRowId}
      {...page}
      empty="La papelera está vacía."
    />
  );
}
