import { ListClientsQuerySchema } from '@norde/core/clients/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { PageHeader } from '@norde/ui/components/page-header';
import { UsersIcon } from 'lucide-react';
import type { Metadata } from 'next';

import { getContainer } from '../../../container';
import type { ClientFilterValues } from '../../../features/clients/components/clients-toolbar';
import { ClientsView } from '../../../features/clients/components/clients-view';
import { CLIENT_LIST_ERROR_MESSAGES } from '../../../features/clients/messages';
import { messageForError } from '../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../lib/list-params';
import { requireSession } from '../../../lib/session';

export const metadata: Metadata = { title: 'Contactos' };

export default async function ContactsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const { value: query, invalidKeys } = parseListParams(ListClientsQuerySchema, await searchParams);
  const result = await getContainer().clients.listClients.execute(query, actor);

  const filters: ClientFilterValues = {
    q: query.q ?? '',
    agentId: query.agentId ?? '',
    branchId: query.branchId ?? '',
    clientType: query.clientType ?? '',
    owners: query.owners,
    createdFrom: query.createdFrom ?? '',
    createdTo: query.createdTo ?? '',
    updatedFrom: query.updatedFrom ?? '',
    updatedTo: query.updatedTo ?? '',
    view: query.view,
  };
  // El nombre del agente filtrado, para el selector: sale de las filas (son suyas).
  const agentLabel =
    result.isOk() && query.agentId !== undefined
      ? result.value.items.find((row) => row.agent?.id === query.agentId)?.agent?.name
      : undefined;
  const canDelete = actor.can('clients:delete') || actor.can('clients:delete-others');

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={UsersIcon}
        title="Contactos"
        subtitle="La agenda de Norde: personas, empresas y grupos, vengan del canal que vengan"
      />

      {invalidKeys.length > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          Algunos filtros de la dirección no eran válidos ({invalidKeys.join(', ')}) y se usaron los
          valores por defecto.
        </p>
      )}

      <Card className="gap-0 overflow-hidden p-0">
        {result.isErr() ? (
          <DataTableError message={messageForError(result.error, CLIENT_LIST_ERROR_MESSAGES)} />
        ) : (
          <ClientsView
            rows={result.value.items}
            total={result.value.total}
            page={result.value.page}
            pageSize={result.value.pageSize}
            sort={query.sort}
            filters={filters}
            agentLabel={agentLabel}
            permissions={{
              create: actor.can('clients:create'),
              delete: canDelete,
              seeTrash: canDelete,
              export: actor.can('clients:export'),
              pickAgents: actor.can('users:read'),
              pickBranches: actor.can('branches:read'),
              assignAgent: actor.can('clients:reassign') && actor.can('users:read'),
            }}
          />
        )}
      </Card>
    </div>
  );
}
