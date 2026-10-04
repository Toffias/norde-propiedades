'use client';

import type { ClientLetterCount, ClientListRow } from '@norde/core/clients/contracts';
import { Button } from '@norde/ui/components/button';
import { PlusIcon } from 'lucide-react';

import { usePanel } from '../../shared/components/entity-sheet';
import { ListNavigationProvider } from '../../shared/components/server-data-table';
import { ClientCreateSheet } from './client-create-sheet';
import { ClientsAgenda, type AgendaLetterPage } from './clients-agenda';
import { ClientsGrid } from './clients-grid';
import {
  ClientsDataActions,
  ClientsToolbar,
  LayoutSwitcher,
  type OpportunityStageOption,
  type ClientFilterValues,
  type ClientLayout,
  type ClientToolbarPermissions,
} from './clients-toolbar';

export interface ClientsPermissions extends ClientToolbarPermissions {
  readonly create: boolean;
  readonly delete: boolean;
  readonly assignAgent: boolean;
}

/** La agenda alfabética: el índice con sus contadores y la letra abierta, si hay una. */
export interface ClientsAgendaData {
  readonly letters: readonly ClientLetterCount[];
  readonly open: AgendaLetterPage | undefined;
}

/** La agenda: grilla o agenda A–Z con filtros, papelera y alta en el panel lateral. */
export function ClientsView({
  rows,
  total,
  page,
  pageSize,
  sort,
  filters,
  layout,
  agenda,
  permissions,
  agentLabel,
  tagLabel,
  opportunityStages,
}: {
  readonly rows: readonly ClientListRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
  readonly filters: ClientFilterValues;
  readonly layout: ClientLayout;
  /** Solo en la vista agenda. */
  readonly agenda: ClientsAgendaData | undefined;
  readonly permissions: ClientsPermissions;
  readonly agentLabel: string | undefined;
  readonly tagLabel: string | undefined;
  /** Para filtrar por estado de oportunidad; vacío si el actor no ve oportunidades. */
  readonly opportunityStages: readonly OpportunityStageOption[];
}) {
  const navigation = usePanel();
  const toolbar = (
    <ClientsToolbar
      filters={filters}
      permissions={permissions}
      agentLabel={agentLabel}
      tagLabel={tagLabel}
      opportunityStages={opportunityStages}
    />
  );

  return (
    <>
      <ListNavigationProvider>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          {/* La papelera se ve siempre en la grilla. */}
          {filters.view === 'active' && <LayoutSwitcher layout={layout} />}
          <div className="ml-auto flex flex-wrap justify-end gap-2">
            <ClientsDataActions filters={filters} permissions={permissions} />
            {permissions.create && (
              <Button type="button" onClick={navigation.openNew}>
                <PlusIcon className="h-4 w-4" />
                Nuevo contacto
              </Button>
            )}
          </div>
        </div>
      </ListNavigationProvider>
      {agenda === undefined ? (
        <ClientsGrid
          rows={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          sort={sort}
          filters={filters}
          canDelete={permissions.delete}
          toolbar={toolbar}
        />
      ) : (
        <ClientsAgenda letters={agenda.letters} open={agenda.open} toolbar={toolbar} />
      )}
      {permissions.create && (
        <ClientCreateSheet navigation={navigation} canAssignAgent={permissions.assignAgent} />
      )}
    </>
  );
}
