'use client';

import type { BranchListItem, TrashViewValue } from '@norde/core/identity/contracts';
import { Badge } from '@norde/ui/components/badge';
import { Button } from '@norde/ui/components/button';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { RowAction, RowActions } from '@norde/ui/components/row-actions';
import {
  ArchiveRestoreIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
  UsersIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import type { ActionResult } from '../../../lib/action-result';
import { formatDateTime } from '../../../lib/format';
import type { PanelData } from '../../../lib/panel-params';
import { usePanel } from '../../shared/components/entity-sheet';
import { ServerDataTable } from '../../shared/components/server-data-table';
import { deleteBranchAction, makeMainBranchAction, restoreBranchAction } from '../actions';
import { BranchSheet, type BranchSheetData } from './branch-sheet';
import { NameSearchToolbar } from './list-toolbar';
import {
  ConfirmActionDialog,
  type ConfirmActionCopy,
} from '../../shared/components/confirm-action-dialog';

export interface BranchPermissions {
  readonly create: boolean;
  readonly update: boolean;
  readonly delete: boolean;
}

interface PendingAction {
  readonly copy: ConfirmActionCopy;
  readonly run: () => Promise<ActionResult>;
}

function getRowId(branch: BranchListItem): string {
  return branch.id;
}

export function BranchesGrid({
  rows,
  total,
  page,
  pageSize,
  sort,
  view,
  text,
  permissions,
  detail,
}: {
  readonly rows: readonly BranchListItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
  readonly view: TrashViewValue;
  readonly text: string;
  readonly permissions: BranchPermissions;
  /** La sucursal del panel de edición, si está abierto. */
  readonly detail: PanelData<BranchSheetData> | undefined;
}) {
  const navigation = usePanel();
  const { openEdit, openNew } = navigation;
  const [pending, setPending] = useState<PendingAction | undefined>();

  const columns = useMemo((): readonly DataTableColumn<BranchListItem>[] => {
    const inTrash = view === 'trash';
    return [
      {
        id: 'name',
        header: 'Sucursal',
        sortable: true,
        className: 'font-medium',
        cell: (branch) => (
          <div className="flex flex-wrap items-center gap-2">
            <span>{branch.name}</span>
            {branch.isMain && <Badge variant="info">Casa central</Badge>}
          </div>
        ),
      },
      {
        id: 'address',
        header: 'Dirección',
        showFrom: 'md',
        className: 'text-muted-foreground',
        cell: (branch) => branch.address ?? '',
      },
      inTrash
        ? {
            id: 'deletedAt',
            header: 'Borrada',
            showFrom: 'md',
            className: 'w-[180px] text-muted-foreground tabular-nums',
            cell: (branch) => formatDateTime(branch.deletedAt),
          }
        : {
            id: 'userCount',
            header: 'Usuarios',
            className: 'w-[100px] text-right tabular-nums',
            cell: (branch) => branch.userCount,
          },
      {
        id: 'actions',
        header: 'Acciones',
        hideHeader: true,
        className: 'w-[150px] text-right',
        cell: (branch) =>
          inTrash ? (
            <RowActions>
              {permissions.delete && (
                <RowAction
                  icon={ArchiveRestoreIcon}
                  label="Restaurar"
                  onClick={() => {
                    setPending({
                      copy: {
                        title: 'Restaurar sucursal',
                        description: `${branch.name} vuelve a estar disponible.`,
                        confirm: 'Restaurar',
                        done: 'Sucursal restaurada',
                      },
                      run: () => restoreBranchAction({ branchId: branch.id }),
                    });
                  }}
                />
              )}
            </RowActions>
          ) : (
            <RowActions>
              <RowAction
                icon={UsersIcon}
                label="Ver usuarios"
                onClick={() => {
                  openEdit(branch.id, 'users');
                }}
              />
              {permissions.update && (
                <>
                  <RowAction
                    icon={PencilIcon}
                    label="Editar"
                    onClick={() => {
                      openEdit(branch.id);
                    }}
                  />
                  <RowAction
                    icon={StarIcon}
                    label="Marcar como casa central"
                    {...(branch.isMain ? { disabledReason: 'Ya es la casa central' } : {})}
                    onClick={() => {
                      setPending({
                        copy: {
                          title: 'Cambiar la casa central',
                          description: `${branch.name} pasa a ser la casa central; la actual deja de serlo.`,
                          confirm: 'Marcar como casa central',
                          done: 'Casa central actualizada',
                        },
                        run: () => makeMainBranchAction({ branchId: branch.id }),
                      });
                    }}
                  />
                </>
              )}
              {permissions.delete && (
                <RowAction
                  icon={Trash2Icon}
                  label="Borrar"
                  destructive
                  {...(branch.isMain
                    ? { disabledReason: 'La casa central no se borra' }
                    : branch.userCount > 0
                      ? { disabledReason: 'Tiene usuarios: pasalos a otra sucursal' }
                      : {})}
                  onClick={() => {
                    setPending({
                      copy: {
                        title: 'Borrar sucursal',
                        description: `${branch.name} va a la papelera; desde ahí la podés restaurar.`,
                        confirm: 'Borrar',
                        done: 'Sucursal enviada a la papelera',
                        destructive: true,
                      },
                      run: () => deleteBranchAction({ branchId: branch.id }),
                    });
                  }}
                />
              )}
            </RowActions>
          ),
      },
    ];
  }, [openEdit, permissions, view]);

  return (
    <>
      <ServerDataTable
        label="Sucursales"
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        getRowId={getRowId}
        toolbar={
          <>
            <NameSearchToolbar
              text={text}
              view={view}
              canSeeTrash={permissions.delete}
              activeLabel="Sucursales"
            />
            {permissions.create && view === 'active' && (
              <Button type="button" className="sm:ml-auto" onClick={openNew}>
                <PlusIcon className="h-4 w-4" />
                Nueva sucursal
              </Button>
            )}
          </>
        }
        empty={
          view === 'trash'
            ? 'La papelera está vacía.'
            : text === ''
              ? 'Todavía no hay sucursales. La primera que cargues es la casa central.'
              : 'No hay sucursales que coincidan con la búsqueda.'
        }
      />
      <BranchSheet navigation={navigation} detail={detail} canEdit={permissions.update} />
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
