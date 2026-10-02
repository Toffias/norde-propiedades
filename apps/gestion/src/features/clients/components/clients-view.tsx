'use client';

import type { ClientListRow } from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import { PlusIcon } from 'lucide-react';

import { usePanel } from '../../shared/components/entity-sheet';
import { ClientCreateSheet } from './client-create-sheet';
import { ClientsGrid } from './clients-grid';
import {
  ClientsToolbar,
  type ClientFilterValues,
  type ClientToolbarPermissions,
} from './clients-toolbar';

export interface ClientsPermissions extends ClientToolbarPermissions {
  readonly create: boolean;
  readonly delete: boolean;
  readonly assignAgent: boolean;
}

/** La agenda: grilla con filtros, papelera y alta en el panel lateral. */
export function ClientsView({
  rows,
  total,
  page,
  pageSize,
  sort,
  filters,
  permissions,
  agentLabel,
}: {
  readonly rows: readonly ClientListRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
  readonly filters: ClientFilterValues;
  readonly permissions: ClientsPermissions;
  readonly agentLabel: string | undefined;
}) {
  const navigation = usePanel();

  return (
    <>
      {permissions.create && (
        <div className="flex justify-end border-b border-border px-4 py-3">
          <Button type="button" onClick={navigation.openNew}>
            <PlusIcon className="h-4 w-4" />
            Nuevo contacto
          </Button>
        </div>
      )}
      <ClientsGrid
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        filters={filters}
        canDelete={permissions.delete}
        toolbar={
          <ClientsToolbar filters={filters} permissions={permissions} agentLabel={agentLabel} />
        }
      />
      {permissions.create && (
        <ClientCreateSheet navigation={navigation} canAssignAgent={permissions.assignAgent} />
      )}
    </>
  );
}
