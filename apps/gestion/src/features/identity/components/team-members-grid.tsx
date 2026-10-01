'use client';

import type { UserListItem } from '@norde/core/identity/contracts';
import { Button } from '@norde/ui/components/button';
import { DataTable, type DataTableColumn } from '@norde/ui/components/data-table';
import { PagedCombobox, type ComboboxOption } from '@norde/ui/components/paged-combobox';
import { RowAction, RowActions } from '@norde/ui/components/row-actions';
import { toast } from '@norde/ui/components/sonner';
import { Loader2Icon, UserMinusIcon, UserPlusIcon } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { addTeamMemberAction, loadUserOptions, removeTeamMemberAction } from '../actions';
import { PANEL_GRID_PAGE_SIZE } from '../panels';

function getRowId(user: UserListItem): string {
  return user.id;
}

/** Sumar un miembro: elegir un usuario (búsqueda paginada) y agregarlo. */
function AddMember({ teamId }: { readonly teamId: string }) {
  const [user, setUser] = useState<ComboboxOption | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    if (user === null) return;
    startTransition(async () => {
      const message = await runAction(() => addTeamMemberAction({ teamId, userId: user.value }));
      if (message !== undefined) {
        toast.error(message);
        return;
      }
      toast.success(`${user.label} se sumó al equipo`);
      setUser(null);
    });
  }

  return (
    <div className="flex w-full gap-2 sm:max-w-[420px]">
      <div className="min-w-0 flex-1">
        <PagedCombobox
          value={user}
          onChange={setUser}
          loadPage={loadUserOptions}
          placeholder="Elegí un usuario"
          searchPlaceholder="Buscar por nombre o email"
        />
      </div>
      <Button type="button" disabled={user === null || pending} onClick={add}>
        {pending ? (
          <Loader2Icon className="h-4 w-4 animate-spin" />
        ) : (
          <UserPlusIcon className="h-4 w-4" />
        )}
        Agregar
      </Button>
    </div>
  );
}

/**
 * Miembros de un equipo dentro de su panel, paginados en el servidor (es el listado de usuarios con
 * `teamId`). La página va en la URL del panel (`panelPage`), sin tocar la de la grilla de equipos.
 */
export function TeamMembersGrid({
  teamId,
  canEdit,
  rows,
  total,
  page,
  pageSize,
  pending: navigating,
  onPageChange,
}: {
  readonly teamId: string;
  readonly canEdit: boolean;
  readonly rows: readonly UserListItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pending: boolean;
  readonly onPageChange: (page: number) => void;
}) {
  const [pending, startTransition] = useTransition();

  const columns = useMemo((): readonly DataTableColumn<UserListItem>[] => {
    const remove = (user: UserListItem) => {
      startTransition(async () => {
        const message = await runAction(() => removeTeamMemberAction({ teamId, userId: user.id }));
        if (message !== undefined) toast.error(message);
        else toast.success(`${user.name} salió del equipo`);
      });
    };
    return [
      {
        id: 'name',
        header: 'Nombre',
        className: 'font-medium',
        cell: (user) => user.name,
      },
      {
        id: 'email',
        header: 'Email',
        showFrom: 'md',
        className: 'text-muted-foreground',
        cell: (user) => user.email,
      },
      {
        id: 'actions',
        header: 'Acciones',
        hideHeader: true,
        className: 'w-[60px] text-right',
        cell: (user) =>
          canEdit && (
            <RowActions>
              <RowAction
                icon={UserMinusIcon}
                label="Sacar del equipo"
                destructive
                {...(pending ? { disabledReason: 'Guardando…' } : {})}
                onClick={() => {
                  remove(user);
                }}
              />
            </RowActions>
          ),
      },
    ];
  }, [canEdit, pending, teamId]);

  return (
    <DataTable
      label="Miembros del equipo"
      columns={columns}
      rows={rows}
      total={total}
      page={page}
      pageSize={pageSize}
      pageSizes={[PANEL_GRID_PAGE_SIZE]}
      onPageChange={onPageChange}
      onPageSizeChange={() => undefined}
      pending={navigating}
      getRowId={getRowId}
      toolbar={canEdit ? <AddMember teamId={teamId} /> : undefined}
      empty="Todavía no tiene miembros."
    />
  );
}
