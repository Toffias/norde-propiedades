'use client';

import type { RoleListItem, RoleViewValue } from '@norde/core/identity/contracts';
import { Badge } from '@norde/ui/components/badge';
import { Button } from '@norde/ui/components/button';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@norde/ui/components/dialog';
import { Input } from '@norde/ui/components/input';
import { RowAction, RowActions } from '@norde/ui/components/row-actions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { toast } from '@norde/ui/components/sonner';
import {
  ArchiveRestoreIcon,
  EyeIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { formatDateTime } from '../../../lib/format';
import { ServerDataTable, useListNavigation } from '../../shared/components/server-data-table';
import { deleteRoleAction, restoreRoleAction } from '../actions';
import { FormAlert } from '../../shared/components/form-alert';

export interface RolePermissions {
  readonly create: boolean;
  readonly update: boolean;
  /** Borrar, restaurar y ver la papelera. */
  readonly delete: boolean;
}

export interface RolesGridProps {
  readonly rows: readonly RoleListItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
  readonly view: RoleViewValue;
  readonly text: string;
  readonly permissions: RolePermissions;
}

function RolesToolbar({
  text,
  view,
  canSeeTrash,
}: {
  readonly text: string;
  readonly view: RoleViewValue;
  readonly canSeeTrash: boolean;
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
      {canSeeTrash && (
        <Select
          value={view}
          onValueChange={(next) => {
            setParams({ view: next === 'active' ? undefined : next });
          }}
        >
          <SelectTrigger className="w-full sm:w-[160px]" aria-label="Qué roles ver">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Roles</SelectItem>
            <SelectItem value="trash">Papelera</SelectItem>
          </SelectContent>
        </Select>
      )}
    </>
  );
}

function getRowId(role: RoleListItem): string {
  return role.id;
}

export function RolesGrid({
  rows,
  total,
  page,
  pageSize,
  sort,
  view,
  text,
  permissions,
}: RolesGridProps) {
  const router = useRouter();
  const [target, setTarget] = useState<RoleListItem | undefined>();

  const columns = useMemo((): readonly DataTableColumn<RoleListItem>[] => {
    const inTrash = view === 'trash';
    return [
      {
        id: 'name',
        header: 'Rol',
        sortable: true,
        className: 'font-medium',
        cell: (role) => (
          <div className="flex flex-wrap items-center gap-2">
            <span>{role.name}</span>
            {role.isSystem && <Badge variant="info">Del sistema</Badge>}
          </div>
        ),
      },
      {
        id: 'description',
        header: 'Descripción',
        showFrom: 'lg',
        className: 'text-muted-foreground',
        cell: (role) => role.description ?? '',
      },
      inTrash
        ? {
            id: 'deletedAt',
            header: 'Borrado',
            showFrom: 'md',
            className: 'w-[180px] text-muted-foreground tabular-nums',
            cell: (role) => formatDateTime(role.deletedAt),
          }
        : {
            id: 'userCount',
            header: 'Usuarios',
            className: 'w-[100px] text-right tabular-nums',
            cell: (role) => role.userCount,
          },
      {
        id: 'actions',
        header: 'Acciones',
        hideHeader: true,
        className: 'w-[100px] text-right',
        cell: (role) => (
          <RowActions>
            {inTrash ? (
              permissions.delete && (
                <RowAction
                  icon={ArchiveRestoreIcon}
                  label="Restaurar"
                  onClick={() => {
                    setTarget(role);
                  }}
                />
              )
            ) : (
              <>
                <RowAction
                  icon={permissions.update ? PencilIcon : EyeIcon}
                  label={permissions.update ? 'Editar' : 'Ver permisos'}
                  onClick={() => {
                    router.push(`/mi-empresa/roles/${role.id}`);
                  }}
                />
                {permissions.delete && (
                  <RowAction
                    icon={Trash2Icon}
                    label="Borrar"
                    destructive
                    {...(role.isSystem
                      ? { disabledReason: 'Los roles del sistema no se borran' }
                      : role.userCount > 0
                        ? { disabledReason: 'Tiene usuarios: asignales otro rol primero' }
                        : {})}
                    onClick={() => {
                      setTarget(role);
                    }}
                  />
                )}
              </>
            )}
          </RowActions>
        ),
      },
    ];
  }, [permissions, router, view]);

  return (
    <>
      <ServerDataTable
        label="Roles"
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        getRowId={getRowId}
        toolbar={
          <>
            <RolesToolbar text={text} view={view} canSeeTrash={permissions.delete} />
            {permissions.create && view === 'active' && (
              <Button asChild className="sm:ml-auto">
                <Link href="/mi-empresa/roles/nuevo">
                  <PlusIcon className="h-4 w-4" />
                  Nuevo rol
                </Link>
              </Button>
            )}
          </>
        }
        empty={
          view === 'trash'
            ? 'La papelera está vacía.'
            : text === ''
              ? 'Todavía no hay roles.'
              : 'No hay roles que coincidan con la búsqueda.'
        }
      />
      <RoleTrashDialog
        role={target}
        restoring={view === 'trash'}
        onOpenChange={(open) => {
          if (!open) setTarget(undefined);
        }}
      />
    </>
  );
}

function RoleTrashDialog({
  role,
  restoring,
  onOpenChange,
}: {
  readonly role: RoleListItem | undefined;
  readonly restoring: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const name = role?.name ?? '';

  function close(next: boolean) {
    if (!next) setError(undefined);
    onOpenChange(next);
  }

  function confirm() {
    if (!role) return;
    startTransition(async () => {
      const input = { roleId: role.id };
      const message = await runAction(() =>
        restoring ? restoreRoleAction(input) : deleteRoleAction(input),
      );
      if (message !== undefined) {
        setError(message);
        return;
      }
      toast.success(restoring ? 'Rol restaurado' : 'Rol enviado a la papelera');
      close(false);
    });
  }

  return (
    <Dialog open={role !== undefined} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{restoring ? 'Restaurar rol' : 'Borrar rol'}</DialogTitle>
          <DialogDescription>
            {restoring
              ? `${name} vuelve a estar disponible para asignar a usuarios.`
              : `${name} va a la papelera; desde ahí lo podés restaurar.`}
          </DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              close(false);
            }}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant={restoring ? 'default' : 'destructive'}
            disabled={pending}
            onClick={confirm}
          >
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            {restoring ? 'Restaurar' : 'Borrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
