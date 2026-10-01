'use client';

import type { TeamListItem, TrashViewValue } from '@norde/core/identity/contracts';
import { Button } from '@norde/ui/components/button';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { RowAction, RowActions } from '@norde/ui/components/row-actions';
import { ArchiveRestoreIcon, PencilIcon, PlusIcon, Trash2Icon, UsersIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { ActionResult } from '../../../lib/action-result';
import { formatDateTime } from '../../../lib/format';
import type { PanelData } from '../../../lib/panel-params';
import { usePanel } from '../../shared/components/entity-sheet';
import { ServerDataTable } from '../../shared/components/server-data-table';
import { deleteTeamAction, restoreTeamAction } from '../actions';
import { NameSearchToolbar } from './list-toolbar';
import { TeamSheet, type TeamSheetData } from './team-sheet';
import {
  ConfirmActionDialog,
  type ConfirmActionCopy,
} from '../../shared/components/confirm-action-dialog';

export interface TeamPermissions {
  readonly create: boolean;
  readonly update: boolean;
  readonly delete: boolean;
}

interface PendingAction {
  readonly copy: ConfirmActionCopy;
  readonly run: () => Promise<ActionResult>;
}

function getRowId(team: TeamListItem): string {
  return team.id;
}

export function TeamsGrid({
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
  readonly rows: readonly TeamListItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
  readonly view: TrashViewValue;
  readonly text: string;
  readonly permissions: TeamPermissions;
  /** El equipo del panel de edición, si está abierto. */
  readonly detail: PanelData<TeamSheetData> | undefined;
}) {
  const navigation = usePanel();
  const { openEdit, openNew } = navigation;
  const [pending, setPending] = useState<PendingAction | undefined>();

  const columns = useMemo((): readonly DataTableColumn<TeamListItem>[] => {
    const inTrash = view === 'trash';
    return [
      {
        id: 'name',
        header: 'Equipo',
        sortable: true,
        className: 'font-medium',
        cell: (team) => team.name,
      },
      {
        id: 'branch',
        header: 'Sucursal',
        showFrom: 'md',
        className: 'text-muted-foreground',
        cell: (team) => team.branch?.name ?? '',
      },
      inTrash
        ? {
            id: 'deletedAt',
            header: 'Borrado',
            showFrom: 'md',
            className: 'w-[180px] text-muted-foreground tabular-nums',
            cell: (team) => formatDateTime(team.deletedAt),
          }
        : {
            id: 'memberCount',
            header: 'Miembros',
            className: 'w-[100px] text-right tabular-nums',
            cell: (team) => team.memberCount,
          },
      {
        id: 'actions',
        header: 'Acciones',
        hideHeader: true,
        className: 'w-[120px] text-right',
        cell: (team) =>
          inTrash ? (
            <RowActions>
              {permissions.delete && (
                <RowAction
                  icon={ArchiveRestoreIcon}
                  label="Restaurar"
                  onClick={() => {
                    setPending({
                      copy: {
                        title: 'Restaurar equipo',
                        description: `${team.name} vuelve con sus miembros.`,
                        confirm: 'Restaurar',
                        done: 'Equipo restaurado',
                      },
                      run: () => restoreTeamAction({ teamId: team.id }),
                    });
                  }}
                />
              )}
            </RowActions>
          ) : (
            <RowActions>
              <RowAction
                icon={UsersIcon}
                label="Miembros"
                onClick={() => {
                  openEdit(team.id, 'members');
                }}
              />
              {permissions.update && (
                <RowAction
                  icon={PencilIcon}
                  label="Editar"
                  onClick={() => {
                    openEdit(team.id);
                  }}
                />
              )}
              {permissions.delete && (
                <RowAction
                  icon={Trash2Icon}
                  label="Borrar"
                  destructive
                  onClick={() => {
                    setPending({
                      copy: {
                        title: 'Borrar equipo',
                        description: `${team.name} va a la papelera con sus miembros; desde ahí lo podés restaurar.`,
                        confirm: 'Borrar',
                        done: 'Equipo enviado a la papelera',
                        destructive: true,
                      },
                      run: () => deleteTeamAction({ teamId: team.id }),
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
        label="Equipos"
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
              activeLabel="Equipos"
            />
            {permissions.create && view === 'active' && (
              <Button type="button" className="sm:ml-auto" onClick={openNew}>
                <PlusIcon className="h-4 w-4" />
                Nuevo equipo
              </Button>
            )}
          </>
        }
        empty={
          view === 'trash'
            ? 'La papelera está vacía.'
            : text === ''
              ? 'Todavía no hay equipos.'
              : 'No hay equipos que coincidan con la búsqueda.'
        }
      />
      <TeamSheet navigation={navigation} detail={detail} canEdit={permissions.update} />
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
