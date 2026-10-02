import { SearchClientTagsQuerySchema } from '@norde/core/clients/contracts';
import { MAX_PAGE_SIZE } from '@norde/core/shared/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import type { Metadata } from 'next';

import { getContainer } from '../../../../container';
import { ClientTagsGrid } from '../../../../features/clients/components/client-tag-catalog';
import { ClientTagsHeader } from '../../../../features/clients/components/client-tags-header';
import { CLIENT_TAGS_ERROR_MESSAGES } from '../../../../features/clients/messages';
import { messageForError } from '../../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import { requireSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Etiquetas de contactos' };

export default async function ClientTagsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const { value: query } = parseListParams(SearchClientTagsQuerySchema, await searchParams);
  const { clients } = getContainer();
  const [result, groups] = await Promise.all([
    clients.searchClientTags.execute(query, actor),
    // El filtro por grupo ofrece una página de grupos, ordenados por nombre: son pocos.
    clients.listClientTagGroups.execute({ page: 1, pageSize: MAX_PAGE_SIZE, sort: 'name' }, actor),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <ClientTagsHeader active="tags" />
      <p className="text-sm leading-normal text-muted-foreground">
        Etiquetas para ordenar la agenda (origen, alquileres, colegas), sueltas o en grupos. Una
        etiqueta en uso no se borra: se unifica con otra.
      </p>
      <Card className="gap-0 overflow-hidden p-0">
        {result.isErr() ? (
          <DataTableError message={messageForError(result.error, CLIENT_TAGS_ERROR_MESSAGES)} />
        ) : (
          <ClientTagsGrid
            data={{ ...result.value, rows: result.value.items, sort: query.sort }}
            text={query.q ?? ''}
            group={query.group}
            groups={groups.isOk() ? groups.value.items : []}
            canEdit={actor.can('tags:update')}
          />
        )}
      </Card>
    </div>
  );
}
