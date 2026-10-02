import { ListClientsQuerySchema } from '@norde/core/clients/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { PageHeader } from '@norde/ui/components/page-header';
import { UsersIcon } from 'lucide-react';
import type { Metadata } from 'next';

import { getContainer } from '../../../container';
import type {
  ClientFilterValues,
  ClientLayout,
} from '../../../features/clients/components/clients-toolbar';
import {
  ClientsView,
  type ClientsAgendaData,
} from '../../../features/clients/components/clients-view';
import {
  CLIENT_LETTERS_ERROR_MESSAGES,
  CLIENT_LIST_ERROR_MESSAGES,
} from '../../../features/clients/messages';
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
  const params = await searchParams;
  const { value: query, invalidKeys } = parseListParams(ListClientsQuerySchema, params);
  const { clients } = getContainer();
  // La agenda A–Z es de los activos; la papelera se ve siempre en la grilla.
  const layout: ClientLayout =
    params.layout === 'agenda' && query.view === 'active' ? 'agenda' : 'grid';

  let agenda: ClientsAgendaData | undefined;
  let lettersError: string | undefined;
  const { page: _page, pageSize: _pageSize, sort: _sort, ...filter } = query;
  if (layout === 'agenda') {
    const letters = await clients.listClientLetters.execute(filter, actor);
    if (letters.isErr()) {
      lettersError = messageForError(letters.error, CLIENT_LETTERS_ERROR_MESSAGES);
    } else {
      agenda = { letters: letters.value, open: undefined };
    }
  }
  // En la agenda, la página es la de la letra abierta (por nombre); sin letra no se trae nada.
  const listQuery =
    layout === 'agenda'
      ? { ...query, sort: { field: 'name' as const, direction: 'asc' as const } }
      : { ...query, letter: undefined };
  const result =
    layout === 'agenda' && query.letter === undefined
      ? undefined
      : await clients.listClients.execute(listQuery, actor);
  if (agenda !== undefined && query.letter !== undefined && result?.isOk()) {
    agenda = {
      ...agenda,
      open: {
        letter: query.letter,
        rows: result.value.items,
        total: result.value.total,
        page: result.value.page,
        pageSize: result.value.pageSize,
      },
    };
  }

  const filters: ClientFilterValues = {
    q: query.q ?? '',
    agentId: query.agentId ?? '',
    branchId: query.branchId ?? '',
    kind: query.kind ?? '',
    clientType: query.clientType ?? '',
    tagged: query.tagged ?? '',
    tagId: query.tagId ?? '',
    letter: layout === 'agenda' ? (query.letter ?? '') : '',
    owners: query.owners,
    createdFrom: query.createdFrom ?? '',
    createdTo: query.createdTo ?? '',
    updatedFrom: query.updatedFrom ?? '',
    updatedTo: query.updatedTo ?? '',
    view: query.view,
  };
  // El nombre del agente filtrado, para el selector: sale de las filas (son suyas).
  const agentLabel =
    result?.isOk() === true && query.agentId !== undefined
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
        {lettersError !== undefined ? (
          <DataTableError message={lettersError} />
        ) : result?.isErr() === true ? (
          <DataTableError message={messageForError(result.error, CLIENT_LIST_ERROR_MESSAGES)} />
        ) : (
          <ClientsView
            rows={result?.isOk() === true ? result.value.items : []}
            total={result?.isOk() === true ? result.value.total : 0}
            page={result?.isOk() === true ? result.value.page : 1}
            pageSize={result?.isOk() === true ? result.value.pageSize : query.pageSize}
            sort={query.sort}
            filters={filters}
            layout={layout}
            agenda={agenda}
            agentLabel={agentLabel}
            tagLabel={undefined}
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
