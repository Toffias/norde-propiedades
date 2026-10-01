'use client';

import type { UserListItem } from '@norde/core/identity/contracts';
import { Badge } from '@norde/ui/components/badge';
import { DataTable, type DataTableColumn } from '@norde/ui/components/data-table';

import { PANEL_GRID_PAGE_SIZE } from '../panels';

function getRowId(user: UserListItem): string {
  return user.id;
}

const COLUMNS: readonly DataTableColumn<UserListItem>[] = [
  {
    id: 'name',
    header: 'Nombre',
    className: 'font-medium',
    cell: (user) => (
      <div className="flex flex-col gap-1">
        <span>{user.name}</span>
        {/* En mobile el email va debajo del nombre. */}
        <span className="text-xs font-normal text-muted-foreground md:hidden">{user.email}</span>
      </div>
    ),
  },
  {
    id: 'email',
    header: 'Email',
    showFrom: 'md',
    className: 'text-muted-foreground',
    cell: (user) => user.email,
  },
  {
    id: 'roles',
    header: 'Roles',
    showFrom: 'md',
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
];

/**
 * Usuarios activos de una sucursal dentro de su panel, paginados en el servidor (es el listado de
 * usuarios con `branchId`). Se cambian de sucursal desde el panel de cada usuario.
 */
export function BranchUsersGrid({
  rows,
  total,
  page,
  pageSize,
  pending,
  onPageChange,
}: {
  readonly rows: readonly UserListItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pending: boolean;
  readonly onPageChange: (page: number) => void;
}) {
  return (
    <DataTable
      label="Usuarios de la sucursal"
      columns={COLUMNS}
      rows={rows}
      total={total}
      page={page}
      pageSize={pageSize}
      pageSizes={[PANEL_GRID_PAGE_SIZE]}
      onPageChange={onPageChange}
      onPageSizeChange={() => undefined}
      pending={pending}
      getRowId={getRowId}
      empty="Todavía no tiene usuarios."
    />
  );
}
