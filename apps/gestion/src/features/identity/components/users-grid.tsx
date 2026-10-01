'use client';

import type { UserListItem, UserStatusValue } from '@norde/core/identity/contracts';
import { Badge } from '@norde/ui/components/badge';
import { Button } from '@norde/ui/components/button';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { Input } from '@norde/ui/components/input';
import { RowAction, RowActions } from '@norde/ui/components/row-actions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import {
  KeyRoundIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ShieldIcon,
  UserCheckIcon,
  UserXIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { formatDateTime } from '../../../lib/format';
import { ServerDataTable, useListNavigation } from '../../shared/components/server-data-table';
import type { RoleOption } from './role-checkboxes';
import { ResetPasswordDialog, UserStatusDialog } from './user-action-dialogs';
import { CreateUserDialog, EditUserDialog } from './user-form-dialogs';

/** Qué puede hacer quien mira la grilla: solo para no mostrar botones que van a fallar. */
export interface UserPermissions {
  readonly create: boolean;
  readonly update: boolean;
  readonly suspend: boolean;
  readonly resetPassword: boolean;
  /** Dar o quitar permisos propios. */
  readonly permissions: boolean;
}

export interface UsersGridProps {
  readonly rows: readonly UserListItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
  readonly status: UserStatusValue;
  readonly text: string;
  readonly roles: readonly RoleOption[];
  readonly permissions: UserPermissions;
  /** El usuario de la sesión: no se puede suspender a sí mismo. */
  readonly currentUserId: string;
}

const STATUS_LABELS: Record<UserStatusValue, string> = {
  active: 'Activos',
  suspended: 'Suspendidos',
};

function UsersToolbar({
  text,
  status,
}: {
  readonly text: string;
  readonly status: UserStatusValue;
}) {
  const { setParams } = useListNavigation();
  const [search, setSearch] = useState(text);

  // Debounce de 300 ms: no se navega con cada tecla.
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
          placeholder="Buscar por nombre o email"
          aria-label="Buscar por nombre o email"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      </div>
      <Select
        value={status}
        onValueChange={(next) => {
          // Activos es el valor por defecto: no hace falta en la URL.
          setParams({ status: next === 'active' ? undefined : next });
        }}
      >
        <SelectTrigger className="w-full sm:w-[160px]" aria-label="Estado">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(['active', 'suspended'] as const).map((value) => (
            <SelectItem key={value} value={value}>
              {STATUS_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

function getRowId(user: UserListItem): string {
  return user.id;
}

export function UsersGrid({
  rows,
  total,
  page,
  pageSize,
  sort,
  status,
  text,
  roles,
  permissions,
  currentUserId,
}: UsersGridProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserListItem | undefined>();
  const [changingStatus, setChangingStatus] = useState<UserListItem | undefined>();
  const [resetting, setResetting] = useState<UserListItem | undefined>();

  const columns = useMemo((): readonly DataTableColumn<UserListItem>[] => {
    const actions: DataTableColumn<UserListItem> = {
      id: 'actions',
      header: 'Acciones',
      hideHeader: true,
      className: 'w-[150px] text-right',
      cell: (user) => (
        <RowActions>
          {permissions.update && (
            <RowAction
              icon={PencilIcon}
              label="Editar"
              onClick={() => {
                setEditing(user);
              }}
            />
          )}
          {permissions.permissions && (
            <RowAction
              icon={ShieldIcon}
              label="Permisos propios"
              {...(user.id === currentUserId
                ? { disabledReason: 'No podés cambiar tus propios permisos' }
                : {})}
              onClick={() => {
                router.push(`/mi-empresa/usuarios/${user.id}/permisos`);
              }}
            />
          )}
          {permissions.resetPassword && (
            <RowAction
              icon={KeyRoundIcon}
              label="Blanquear contraseña"
              onClick={() => {
                setResetting(user);
              }}
            />
          )}
          {permissions.suspend &&
            (user.status === 'active' ? (
              <RowAction
                icon={UserXIcon}
                label="Suspender"
                destructive
                {...(user.id === currentUserId
                  ? { disabledReason: 'No podés suspenderte a vos mismo' }
                  : {})}
                onClick={() => {
                  setChangingStatus(user);
                }}
              />
            ) : (
              <RowAction
                icon={UserCheckIcon}
                label="Reactivar"
                onClick={() => {
                  setChangingStatus(user);
                }}
              />
            ))}
        </RowActions>
      ),
    };

    return [
      {
        id: 'name',
        header: 'Nombre',
        sortable: true,
        className: 'font-medium',
        cell: (user) => (
          <div className="flex flex-col gap-1">
            <span>{user.name}</span>
            {/* En mobile el email va debajo del nombre. */}
            <span className="text-xs font-normal text-muted-foreground md:hidden">
              {user.email}
            </span>
            {user.mustChangePassword && (
              <Badge variant="warning" className="md:hidden">
                Contraseña temporal
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: 'email',
        header: 'Email',
        sortable: true,
        showFrom: 'md',
        className: 'text-muted-foreground',
        cell: (user) => user.email,
      },
      {
        id: 'roles',
        header: 'Roles',
        showFrom: 'lg',
        cell: (user) => (
          <div className="flex flex-wrap gap-1">
            {user.roles.map((role) => (
              <Badge key={role.id} variant="secondary">
                {role.name}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        id: 'lastLoginAt',
        header: 'Último ingreso',
        sortable: true,
        showFrom: 'md',
        className: 'w-[180px] text-muted-foreground tabular-nums',
        cell: (user) =>
          user.mustChangePassword ? (
            <Badge variant="warning">Contraseña temporal</Badge>
          ) : (
            formatDateTime(user.lastLoginAt)
          ),
      },
      actions,
    ];
  }, [permissions, currentUserId, router]);

  const hasFilters = text !== '';

  return (
    <>
      <ServerDataTable
        label="Usuarios"
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        getRowId={getRowId}
        toolbar={
          <>
            <UsersToolbar text={text} status={status} />
            {permissions.create && (
              <Button
                type="button"
                className="sm:ml-auto"
                onClick={() => {
                  setCreating(true);
                }}
              >
                <PlusIcon className="h-4 w-4" />
                Nuevo usuario
              </Button>
            )}
          </>
        }
        empty={
          hasFilters
            ? 'No hay usuarios que coincidan con la búsqueda.'
            : status === 'suspended'
              ? 'No hay usuarios suspendidos.'
              : 'Todavía no hay usuarios.'
        }
      />
      <CreateUserDialog open={creating} onOpenChange={setCreating} roles={roles} />
      <EditUserDialog
        user={editing}
        roles={roles}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
      />
      <UserStatusDialog
        user={changingStatus}
        onOpenChange={(open) => {
          if (!open) setChangingStatus(undefined);
        }}
      />
      <ResetPasswordDialog
        user={resetting}
        onOpenChange={(open) => {
          if (!open) setResetting(undefined);
        }}
      />
    </>
  );
}
